import { unsafeGlobalClient } from "@pdm/database";
import { repositoriesFor } from "@pdm/database/repositories";
import { classify, type VendorPattern } from "@pdm/analysis/classify";
import {
  extractPolicyLinksFromHtml,
  selectBestPolicyLink,
  resolveSafePolicyUrl,
  extractCleanText,
  COMMON_POLICY_PATHS,
} from "@pdm/scanner";
import {
  filterGroundedVendors,
  extractPolicyVendorsHeuristic,
  extractEffectiveDate,
} from "@pdm/ai";
import { childLogger } from "@pdm/shared/logger";

const db = unsafeGlobalClient("policy audit vendor lookup");

export interface PolicyAuditJobInput {
  agencyId: string;
  websiteId: string;
  scanId: string;
  url: string;
  policyUrl?: string;
}

export interface PolicyAuditResult {
  id: string;
  policyUrl: string;
  effectiveDate: Date | null;
  declaredVendors: string[];
  detectedVendors: string[];
  undisclosedVendors: string[];
  staleVendors: string[];
  complianceScore: number;
}

/**
 * Loads active vendor catalogue for classification.
 */
async function loadVendors(): Promise<VendorPattern[]> {
  const vendors = await db.trackerVendor.findMany({ where: { isActive: true } });
  return vendors.map((vendor) => ({
    id: vendor.id,
    slug: vendor.slug,
    name: vendor.name,
    category: vendor.category,
    riskLevel: vendor.riskLevel,
    domainPatterns: vendor.domainPatterns,
    scriptPatterns: vendor.scriptPatterns,
    cookiePatterns: vendor.cookiePatterns,
    storagePatterns: vendor.storagePatterns,
    requestPathPatterns: vendor.requestPathPatterns,
    baseConfidence: vendor.baseConfidence,
    isEssentialCandidate: vendor.isEssentialCandidate,
  }));
}

/**
 * Safely fetches HTML from a URL with timeout and size limits.
 */
async function fetchSafeHtml(url: string): Promise<string | null> {
  const safeUrl = await resolveSafePolicyUrl(url);
  if (!safeUrl) return null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(safeUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 PrivacyDriftMonitor/1.0",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    clearTimeout(timeout);
    if (!res.ok) return null;

    const html = await res.text();
    // Cap raw HTML size at 2MB
    return html.slice(0, 2 * 1024 * 1024);
  } catch {
    return null;
  }
}

/**
 * Discovers the policy URL on a target website.
 */
async function findPolicyUrl(
  siteUrl: string,
  entryHtml?: string | null,
): Promise<string | null> {
  let baseUrl: URL;
  try {
    baseUrl = new URL(siteUrl);
  } catch {
    return null;
  }

  // 1. If we have homepage HTML, look for footer/anchor links
  if (entryHtml) {
    const links = extractPolicyLinksFromHtml(entryHtml, baseUrl.toString());
    const best = selectBestPolicyLink(links, baseUrl.toString());
    if (best) return best;
  }

  // 2. Probe common paths if entry HTML didn't yield a link
  for (const path of COMMON_POLICY_PATHS) {
    try {
      const candidate = new URL(path, baseUrl.origin).toString();
      const safeCandidate = await resolveSafePolicyUrl(candidate);
      if (safeCandidate) {
        // Quick HEAD/GET probe
        const probeRes = await fetch(safeCandidate, {
          method: "HEAD",
          headers: { "User-Agent": "PrivacyDriftMonitor/1.0" },
        }).catch(() => null);

        if (probeRes && probeRes.ok) {
          return safeCandidate;
        }
      }
    } catch {
      // Continue next path
    }
  }

  return null;
}

/**
 * Runs policy discovery, text extraction, vendor reconciliation, and database persistence.
 */
export async function runPolicyAudit(
  input: PolicyAuditJobInput,
): Promise<PolicyAuditResult | null> {
  const log = childLogger({
    agencyId: input.agencyId,
    websiteId: input.websiteId,
    scanId: input.scanId,
  });

  const repos = repositoriesFor(input.agencyId);

  // 1. Determine policy URL
  let targetPolicyUrl = input.policyUrl ?? null;
  let policyHtml: string | null = null;

  if (!targetPolicyUrl) {
    // Try fetching homepage first to discover link
    const homepageHtml = await fetchSafeHtml(input.url);
    targetPolicyUrl = await findPolicyUrl(input.url, homepageHtml);
  }

  if (!targetPolicyUrl) {
    log.info("no privacy policy URL discovered on site");
    return null;
  }

  // 2. Fetch policy HTML
  policyHtml = await fetchSafeHtml(targetPolicyUrl);
  if (!policyHtml) {
    log.warn({ policyUrl: targetPolicyUrl }, "failed to fetch policy HTML");
    return null;
  }

  // 3. Extract clean text
  const cleanText = extractCleanText(policyHtml, { maxCharacters: 15000 });
  if (cleanText.length < 100) {
    log.warn({ policyUrl: targetPolicyUrl }, "extracted policy text too short for analysis");
    return null;
  }

  // 4. Extract declared vendors & effective date
  // Uses heuristic extractor (with grounding filter) which works deterministically
  const extracted = extractPolicyVendorsHeuristic(cleanText);
  const groundedVendors = filterGroundedVendors(extracted.declaredVendors, cleanText);

  let effectiveDate: Date | null = null;
  if (extracted.effectiveDate) {
    const parsed = Date.parse(extracted.effectiveDate);
    if (!Number.isNaN(parsed)) {
      effectiveDate = new Date(parsed);
    }
  }
  if (!effectiveDate) {
    const rawDate = extractEffectiveDate(cleanText);
    if (rawDate) {
      const parsed = Date.parse(rawDate);
      if (!Number.isNaN(parsed)) effectiveDate = new Date(parsed);
    }
  }

  // 5. Gather detected vendors from technical scanner evidence
  const [vendors, requests, cookies, storage] = await Promise.all([
    loadVendors(),
    repos.db.networkRequest.findMany({ where: { scanId: input.scanId } }),
    repos.db.cookieRecord.findMany({ where: { scanId: input.scanId } }),
    repos.db.storageEntry.findMany({ where: { scanId: input.scanId } }),
  ]);

  const detections = classify({
    vendors,
    requests: requests as never,
    cookies: cookies as never,
    storage: storage as never,
  });

  const vendorsById = new Map(vendors.map((v) => [v.id, v]));

  // Observed vendor names and slugs
  const detectedNames = new Set<string>();
  const detectedSlugs = new Set<string>();

  for (const d of detections) {
    if (!d.vendorId) continue;
    const v = vendorsById.get(d.vendorId);
    if (v) {
      detectedNames.add(v.name);
      detectedSlugs.add(v.slug);
    }
  }

  const detectedVendorsList = Array.from(detectedNames);

  // 6. Reconcile Declared vs Detected
  const declaredLower = new Set(groundedVendors.map((v) => v.toLowerCase()));
  const undisclosedVendors: string[] = [];

  for (const slug of detectedSlugs) {
    const v = vendors.find((candidate) => candidate.slug === slug);
    if (!v) continue;

    const isDeclared =
      declaredLower.has(v.name.toLowerCase()) ||
      declaredLower.has(v.slug.toLowerCase()) ||
      Array.from(declaredLower).some((decl) => decl.includes(v.slug) || v.name.toLowerCase().includes(decl));

    if (!isDeclared) {
      undisclosedVendors.push(v.slug);
    }
  }

  const staleVendors: string[] = [];
  for (const declared of groundedVendors) {
    const foundInDetected = Array.from(detectedNames).some(
      (name) => name.toLowerCase().includes(declared.toLowerCase()) || declared.toLowerCase().includes(name.toLowerCase()),
    );
    if (!foundInDetected) {
      staleVendors.push(declared);
    }
  }

  // 7. Calculate compliance/alignment score (0 - 100)
  const totalObserved = detectedSlugs.size;
  let complianceScore = 100;
  if (totalObserved > 0) {
    const properlyDisclosed = Math.max(0, totalObserved - undisclosedVendors.length);
    complianceScore = Math.round((properlyDisclosed / totalObserved) * 100);
  }

  // 8. Persist PolicyAudit row in database
  const created = await repos.db.policyAudit.create({
    data: {
      agencyId: input.agencyId,
      websiteId: input.websiteId,
      scanId: input.scanId,
      policyUrl: targetPolicyUrl,
      effectiveDate,
      declaredVendors: groundedVendors,
      detectedVendors: detectedVendorsList,
      undisclosedVendors,
      staleVendors,
      complianceScore,
    },
  });

  log.info(
    {
      policyAuditId: created.id,
      declaredCount: groundedVendors.length,
      detectedCount: detectedVendorsList.length,
      undisclosedCount: undisclosedVendors.length,
      score: complianceScore,
    },
    "policy audit completed and recorded",
  );

  return {
    id: created.id,
    policyUrl: created.policyUrl,
    effectiveDate: created.effectiveDate,
    declaredVendors: created.declaredVendors,
    detectedVendors: created.detectedVendors,
    undisclosedVendors: created.undisclosedVendors,
    staleVendors: created.staleVendors,
    complianceScore: created.complianceScore,
  };
}
