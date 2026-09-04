#!/usr/bin/env node

/**
 * Privacy Drift Monitor — Pre-Deployment PR Audit Runner
 * Standalone Node.js script executed by GitHub Actions runner.
 */

import { appendFileSync } from "node:fs";

function getInput(name, defaultValue = "") {
  const envName = `INPUT_${name.toUpperCase().replace(/-/g, "_")}`;
  const val = process.env[envName];
  return (val !== undefined && val !== "") ? val : defaultValue;
}

function setOutput(name, value) {
  const outputFile = process.env.GITHUB_OUTPUT;
  if (outputFile) {
    appendFileSync(outputFile, `${name}=${value}\n`);
  }
}

function writeSummary(markdown) {
  const summaryFile = process.env.GITHUB_STEP_SUMMARY;
  if (summaryFile) {
    appendFileSync(summaryFile, `${markdown}\n\n`);
  }
  console.log(markdown);
}

async function apiRequest(url, apiKey, options = {}) {
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
    "User-Agent": "PDM-GitHub-Action/1.0.0",
    ...(options.headers || {}),
  };

  const res = await fetch(url, { ...options, headers });
  const data = await res.json().catch(() => null);

  if (!res.ok) {
    const errorMsg = data?.error?.message || `HTTP ${res.status} ${res.statusText}`;
    throw new Error(`API Error: ${errorMsg}`);
  }

  return data;
}

async function resolveWebsiteId(apiUrl, apiKey, websiteId, websiteUrl) {
  if (websiteId) return websiteId;
  if (!websiteUrl) {
    throw new Error("Either website_id or website_url must be provided.");
  }

  console.log(`Resolving website ID for URL: ${websiteUrl}`);
  const list = await apiRequest(`${apiUrl}/api/v1/websites?limit=100`, apiKey);
  const websites = list?.data || [];

  const normalizedInput = websiteUrl.replace(/\/+$/, "").toLowerCase();
  const match = websites.find((site) => {
    const siteUrl = (site.url || "").replace(/\/+$/, "").toLowerCase();
    const origUrl = (site.originalUrl || "").replace(/\/+$/, "").toLowerCase();
    return siteUrl === normalizedInput || origUrl === normalizedInput;
  });

  if (!match) {
    throw new Error(
      `No website in Privacy Drift Monitor matches URL: ${websiteUrl}. Please add it to your agency dashboard first.`
    );
  }

  return match.id;
}

async function pollScanCompletion(apiUrl, apiKey, scanId, timeoutSeconds) {
  const startTime = Date.now();
  const deadline = startTime + timeoutSeconds * 1000;

  console.log(`Waiting for scan ${scanId} to complete (timeout: ${timeoutSeconds}s)...`);

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 4000));

    const response = await apiRequest(`${apiUrl}/api/v1/scans/${scanId}`, apiKey);
    const scan = response?.data;

    if (!scan) continue;

    console.log(`  Scan status: ${scan.status} (requests: ${scan.requestCount || 0})`);

    if (scan.status === "COMPLETED" || scan.status === "PARTIAL" || scan.status === "FAILED") {
      return scan;
    }
  }

  throw new Error(`Timeout waiting for scan ${scanId} after ${timeoutSeconds}s.`);
}

async function run() {
  const apiKey = getInput("api_key");
  const apiUrl = getInput("api_url", "https://app.privacy-drift-monitor.com").replace(/\/+$/, "");
  const rawWebsiteId = getInput("website_id");
  const websiteUrl = getInput("website_url");
  const failBelowScore = parseInt(getInput("fail_below_score", "85"), 10);
  const blockPreConsent = getInput("block_pre_consent_trackers", "true").toLowerCase() === "true";
  const waitForScan = getInput("wait_for_scan", "true").toLowerCase() === "true";
  const timeoutSeconds = parseInt(getInput("timeout_seconds", "180"), 10);

  if (!apiKey) {
    console.error("::error::Missing required input: api_key");
    process.exit(1);
  }

  try {
    const websiteId = await resolveWebsiteId(apiUrl, apiKey, rawWebsiteId, websiteUrl);

    console.log(`Triggering on-demand verification scan for website: ${websiteId}`);
    const triggerRes = await apiRequest(`${apiUrl}/api/v1/websites/${websiteId}/scans`, apiKey, {
      method: "POST",
      body: JSON.stringify({ trigger: "CI_CD" }),
    });

    const scanId = triggerRes?.data?.scanId;
    if (!scanId) {
      throw new Error("API did not return a valid scanId.");
    }

    setOutput("scan_id", scanId);
    console.log(`Scan enqueued successfully: ${scanId}`);

    if (!waitForScan) {
      writeSummary(
        `### Privacy Drift Scan Dispatched\nScan ID \`${scanId}\` has been enqueued asynchronously.`
      );
      setOutput("verdict", "PENDING");
      process.exit(0);
    }

    const scan = await pollScanCompletion(apiUrl, apiKey, scanId, timeoutSeconds);

    const score = scan.healthScore ?? 0;
    const criticalCount = scan.criticalIssueCount ?? 0;
    const issues = scan.issues || [];
    const preConsentIssues = issues.filter(
      (iss) =>
        iss.category === "TRACKER_WITHOUT_CONSENT" ||
        iss.category === "COOKIE_WITHOUT_CONSENT" ||
        iss.ruleId === "PDM-R001" ||
        iss.ruleId === "PDM-R002"
    );

    setOutput("health_score", score);
    setOutput("critical_issues", criticalCount);

    let hasRegressions = false;
    const failureReasons = [];

    if (scan.status === "FAILED") {
      hasRegressions = true;
      failureReasons.push("Scan execution failed.");
    }

    if (score < failBelowScore) {
      hasRegressions = true;
      failureReasons.push(`Health Score (${score}) is below required threshold (${failBelowScore}).`);
    }

    if (blockPreConsent && preConsentIssues.length > 0) {
      hasRegressions = true;
      failureReasons.push(
        `Pre-consent tracking detected: ${preConsentIssues.length} tracker(s) or cookie(s) fired before consent.`
      );
    }

    const verdict = hasRegressions ? "FAILED" : "PASSED";
    setOutput("verdict", verdict);

    // Markdown step summary
    const summaryLines = [
      `## Privacy Drift Monitor — Pre-Deploy Audit`,
      ``,
      `| Metric | Result | Target | Status |`,
      `| :--- | :--- | :--- | :--- |`,
      `| **Scan Status** | \`${scan.status}\` | \`COMPLETED\` | ${scan.status === "COMPLETED" ? "✅" : "⚠️"} |`,
      `| **Health Score** | **${score}/100** | ≥ ${failBelowScore} | ${score >= failBelowScore ? "✅" : "❌"} |`,
      `| **Critical Issues** | ${criticalCount} | 0 | ${criticalCount === 0 ? "✅" : "❌"} |`,
      `| **Pre-Consent Trackers** | ${preConsentIssues.length} | 0 | ${preConsentIssues.length === 0 ? "✅" : "❌"} |`,
      ``,
    ];

    if (failureReasons.length > 0) {
      summaryLines.push(`### ⚠️ Regression Checks Failed`);
      for (const reason of failureReasons) {
        summaryLines.push(`- ${reason}`);
      }
      summaryLines.push(``);
    }

    if (issues.length > 0) {
      summaryLines.push(`### Potential Issues Detected (${issues.length})`);
      summaryLines.push(`| Severity | Rule ID | Description |`);
      summaryLines.push(`| :--- | :--- | :--- |`);
      for (const iss of issues.slice(0, 10)) {
        summaryLines.push(`| **${iss.severity}** | \`${iss.ruleId}\` | ${iss.title} |`);
      }
      if (issues.length > 10) {
        summaryLines.push(`| ... | ... | *${issues.length - 10} additional items omitted* |`);
      }
      summaryLines.push(``);
    }

    summaryLines.push(`[View Full Scan & Technical Evidence in PDM](${apiUrl}/app/websites/${websiteId}/scans/${scanId})`);

    writeSummary(summaryLines.join("\n"));

    if (hasRegressions) {
      console.error(`::error::Privacy Drift Guard failed: ${failureReasons.join(" ")}`);
      process.exit(1);
    } else {
      console.log("Privacy Drift Guard passed successfully.");
      process.exit(0);
    }
  } catch (err) {
    console.error(`::error::${err.message}`);
    process.exit(1);
  }
}

run();
