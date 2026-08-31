import { Prisma, unsafeGlobalClient } from "@pdm/database";
import { repositoriesFor, type FindingInput } from "@pdm/database/repositories";
import { classify, type VendorPattern } from "@pdm/analysis/classify";
import { evaluateRules, type Finding } from "@pdm/analysis/rules";
import { computeScore } from "@pdm/analysis/score";
import {
  diffScans,
  pickBaseline,
  type ScanFingerprint,
} from "@pdm/analysis/drift";
import type { ConsentPhase, PhaseResult } from "@pdm/scanner/types";
import { childLogger } from "@pdm/shared/logger";

/**
 * ANALYSIS JOB — PLAN.md Part IV §4.14, Phase 3 task 3.8.
 *
 * ⚠️ SEPARATE FROM THE SCAN JOB, DELIBERATELY (§3.8). Two reasons, both
 * load-bearing:
 *   1. A scan that succeeded must not be marked failed because a rule predicate
 *      threw. The recording is the expensive, unrepeatable part.
 *   2. Rules change. Re-running analysis over STORED evidence is how a tuned
 *      rule is validated against history (§4.14) — which is only possible if
 *      analysis is a step that can be run again on its own.
 *
 * ⚠️ IT READS EVIDENCE AND WRITES INTERPRETATION. It never touches the
 * evidence tables. That boundary is what makes the pipeline replayable (P6).
 */

const db = unsafeGlobalClient(
  // Justification (required in review): the vendor catalogue is a GLOBAL table,
  // shared by every agency. Everything tenant-scoped below goes through
  // `repositoriesFor`.
  "tracker vendor catalogue is global, not tenant-scoped",
);

const RULE_VERSION = 1;

/** Loaded once per analysis run — the catalogue is ~74 rows and changes rarely. */
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
 * Turns a rule Finding into the persisted issue shape.
 *
 * ⚠️ `message`, `technicalReason` and `recommendedAction` are RULE-AUTHORED and
 * deterministic — never AI-generated (§6.5). An issue must read identically
 * every time it is opened; AI explanation is an additive layer on top, and it
 * arrives in Phase 5.
 */
function toIssue(finding: Finding, confidence: number): FindingInput {
  return {
    ruleId: finding.ruleId,
    ruleVersion: RULE_VERSION,
    fingerprint: finding.fingerprint,
    category: finding.category as never,
    severity: finding.severity as never,
    confidence,
    title: finding.title,
    message: finding.rationale,
    technicalReason: finding.rationale,
    recommendedAction:
      "Review this with whoever manages the site's tag configuration.",
  };
}

/**
 * Reduces a scan to the comparable sets the drift engine diffs.
 *
 * ⚠️ Stored on the scan as `fingerprints` so a later diff never re-reads the
 * evidence tables. A drift comparison that had to load two scans' worth of
 * requests would be the slowest query in the product, run on every scan.
 *
 * ⚠️ The PHASE is part of every key. `ga4@NO_CONSENT` and `ga4@ACCEPT_ALL` are
 * different facts, and a fingerprint that dropped the phase would report a
 * tracker moving from post-consent to pre-consent as no change at all.
 */
function toFingerprint(
  scanId: string,
  detections: readonly { vendorId: string | null; unknownDomain: string | null; consentPhase: string }[],
  vendorsById: ReadonlyMap<string, VendorPattern>,
  cookies: readonly { name: string; consentPhase: string }[],
  requests: readonly { registrableDomain: string; isThirdParty: boolean }[],
  cmpId: string | null,
  healthScore: number | null,
): ScanFingerprint {
  return {
    scanId,
    trackers: detections
      .filter((detection) => detection.vendorId !== null)
      .map(
        (detection) =>
          `${vendorsById.get(detection.vendorId!)?.slug ?? detection.vendorId}@${detection.consentPhase}`,
      ),
    cookies: cookies.map((cookie) => `${cookie.name}@${cookie.consentPhase}`),
    domains: [
      ...new Set(
        requests
          .filter((request) => request.isThirdParty)
          .map((request) => request.registrableDomain),
      ),
    ],
    cmpId,
    healthScore,
  };
}

export interface AnalysisResult {
  detections: number;
  findings: number;
  created: number;
  reopened: number;
  suppressed: number;
  resolved: number;
  /** Issues a person marked RESOLVED that this scan confirmed are gone (§6.5). */
  verified: number;
  score: number;
  scoreConfidence: "FULL" | "PARTIAL";
  driftEvents: number;
}

/**
 * Analyses one stored scan. Idempotent: running it twice over the same
 * evidence produces the same issues, because deduplication is by fingerprint.
 */
export async function analyseScan(
  agencyId: string,
  scanId: string,
): Promise<AnalysisResult> {
  const log = childLogger({ agencyId, scanId });
  const repos = repositoriesFor(agencyId);

  const scan = await repos.scans.withPhases(scanId);
  if (!scan) throw new Error(`scan ${scanId} not found`);

  const [vendors, requests, cookies, storage] = await Promise.all([
    loadVendors(),
    repos.db.networkRequest.findMany({ where: { scanId } }),
    repos.db.cookieRecord.findMany({ where: { scanId } }),
    repos.db.storageEntry.findMany({ where: { scanId } }),
  ]);

  const detections = classify({
    vendors,
    requests: requests as never,
    cookies: cookies as never,
    storage: storage as never,
  });

  // The rule engine reads PhaseResult; the stored rows carry the same fields
  // minus the evidence arrays, which rules do not consult per phase.
  const phases: PhaseResult[] = scan.phases.map((phase) => ({
    phase: phase.phase as ConsentPhase,
    status: phase.status,
    startedAt: phase.startedAt ?? new Date(0),
    finishedAt: phase.finishedAt ?? new Date(0),
    durationMs: phase.durationMs ?? 0,
    actionMethod: phase.actionMethod as never,
    actionConfidence: phase.actionConfidence,
    selectorUsed: phase.selectorUsed,
    elementText: phase.elementText,
    inIframe: phase.inIframe,
    bannerDismissed: phase.bannerDismissed,
    errorCode: phase.errorCode as never,
    errorMessage: phase.errorMessage,
    requests: [],
    cookies: [],
    storage: [],
    consoleLogs: [],
    screenshots: [],
  }));

  const findings = evaluateRules({
    phases,
    detections,
    vendorsById: new Map(vendors.map((vendor) => [vendor.id, vendor])),
    requests: requests as never,
    cookies: cookies as never,
    storage: storage as never,
  });

  const confidenceByFingerprint = new Map(
    detections.map((detection) => [detection.vendorId ?? "", detection.confidence]),
  );

  const upsert = await repos.issues.upsertFromScan({
    websiteId: scan.website.id,
    scanId,
    detectedAt: scan.finishedAt ?? new Date(),
    findings: findings.map((finding) =>
      toIssue(finding, confidenceByFingerprint.get(finding.subject) ?? 0.9),
    ),
  });

  /*
   * ⚠️ AUTO-RESOLVE ONLY ON A COMPLETE SCAN. A PARTIAL scan produces no
   * findings for the journeys that did not run, and treating that silence as
   * "fixed" would close real issues every time a banner failed to load. This
   * is the same rule that stops PARTIAL becoming a drift baseline (§4.10, P5).
   */
  let resolved = 0;
  let verified = 0;
  if (scan.status === "COMPLETED") {
    const seenFingerprints = findings.map((finding) => finding.fingerprint);

    resolved = await repos.issues.markResolvedIfAbsent({
      websiteId: scan.website.id,
      scanId,
      seenFingerprints,
      resolvedAt: scan.finishedAt ?? new Date(),
    });

    /*
     * ⚠️ VERIFICATION — §6.5, Phase 4 task 4.7. A user marking an issue
     * RESOLVED is a CLAIM; a scan that re-ran and did not find it is our
     * EVIDENCE, and only the second earns `VERIFIED`. This runs on every
     * complete scan, not only on `trigger === "VERIFICATION"`: a scheduled scan
     * that happens to confirm a fix is exactly as good a proof, and waiting for
     * a dedicated run would leave the issue sitting in RESOLVED for a week.
     *
     * The order matters: `markResolvedIfAbsent` above has just moved this
     * scan's absent OPEN issues into RESOLVED, and those must NOT be verified
     * by the same scan that resolved them — a finding has to be absent from a
     * scan that ran AFTER someone said they fixed it. Hence the exclusion of
     * `verificationScanId === scanId` below.
     */
    verified = await repos.issues.verifyResolved({
      websiteId: scan.website.id,
      scanId,
      seenFingerprints,
      verifiedAt: scan.finishedAt ?? new Date(),
    });
  }

  const score = computeScore({ findings, phases });

  // The score and its breakdown are written together — a score without the
  // breakdown that explains it is the number nobody can defend (§4.12).
  await repos.db.scan.update({
    where: { id: scanId },
    data: {
      healthScore: score.score,
      scoreConfidence: score.confidence,
      scoreBreakdown: score.breakdown as never,
      issueCount: upsert.created + upsert.updated + upsert.reopened,
      trackerCount: detections.filter((d) => d.vendorId !== null).length,
    },
  });

  await repos.db.website.update({
    where: { id: scan.website.id },
    data: {
      healthScore: score.score,
      scoreConfidence: score.confidence,
      openIssueCount: await repos.db.issue.count({
        where: {
          websiteId: scan.website.id,
          status: { notIn: ["RESOLVED", "VERIFIED", "IGNORED"] },
        },
      }),
      criticalIssueCount: await repos.db.issue.count({
        where: {
          websiteId: scan.website.id,
          severity: "CRITICAL",
          status: { notIn: ["RESOLVED", "VERIFIED", "IGNORED"] },
        },
      }),
      trackerCount: detections.filter((d) => d.vendorId !== null).length,
    },
  });

  // Detections are stored too: the Trackers tab reads them, and a finding must
  // trace back to the detection that produced it (P2).
  await repos.db.trackerDetection.createMany({
    data: detections.map((detection) => ({
      scanId,
      agencyId,
      websiteId: scan.website.id,
      vendorId: detection.vendorId,
      unknownDomain: detection.unknownDomain,
      consentPhase: detection.consentPhase as never,
      firstSeenAtMs: detection.firstSeenAtMs,
      requestCount: detection.requestCount,
      matchedVia: detection.matchedVia,
      confidence: detection.confidence,
      corroborated: detection.corroborated,
      evidenceSummary: detection.evidenceSummary as never,
    })),
  });

  /* ── Drift ──────────────────────────────────────────────────────────── */
  const vendorsById = new Map(vendors.map((vendor) => [vendor.id, vendor]));
  const current = toFingerprint(
    scanId,
    detections,
    vendorsById,
    cookies,
    requests,
    scan.detectedCmpId,
    score.score,
  );

  await repos.db.scan.update({
    where: { id: scanId },
    data: { fingerprints: current as never },
  });

  const driftEvents = await recordDrift(repos, agencyId, scan.website.id, scanId, current);

  const result: AnalysisResult = {
    driftEvents,
    detections: detections.length,
    findings: findings.length,
    created: upsert.created,
    reopened: upsert.reopened,
    suppressed: upsert.suppressed,
    resolved,
    verified,
    score: score.score,
    scoreConfidence: score.confidence,
  };

  log.info(result, "analysis complete");
  return result;
}

/**
 * Compares this scan against the last COMPLETED one and records what changed.
 *
 * ⚠️ THE BASELINE IS CHOSEN BY `pickBaseline`, which only ever returns a
 * COMPLETED scan. Diffing against a PARTIAL one reports everything the
 * incomplete scan missed as a removal (§4.10) — the single most likely source
 * of false drift, and the kind that is loud rather than silent.
 *
 * ⚠️ A scan with no COMPLETED predecessor produces NO drift events. The first
 * scan of a website is a baseline, not a change: reporting every tracker on a
 * newly added site as "newly added" would bury the real signal on day one.
 */
async function recordDrift(
  repos: ReturnType<typeof repositoriesFor>,
  agencyId: string,
  websiteId: string,
  currentScanId: string,
  current: ScanFingerprint,
): Promise<number> {
  const candidates = await repos.db.scan.findMany({
    where: { websiteId, id: { not: currentScanId }, fingerprints: { not: Prisma.DbNull } },
    select: { id: true, status: true, finishedAt: true },
    orderBy: { finishedAt: "desc" },
    take: 20,
  });

  const baseline = pickBaseline(
    candidates.map((candidate) => ({
      scanId: candidate.id,
      status: candidate.status,
      finishedAt: candidate.finishedAt,
    })),
  );
  if (!baseline) return 0;

  const previousScan = await repos.db.scan.findUnique({
    where: { id: baseline.scanId },
    select: { fingerprints: true },
  });
  if (!previousScan?.fingerprints) return 0;

  const events = diffScans({
    previous: previousScan.fingerprints as unknown as ScanFingerprint,
    current,
  });
  if (events.length === 0) return 0;

  await repos.db.privacyDriftEvent.createMany({
    data: events.map((event) => ({
      agencyId,
      websiteId,
      currentScanId,
      previousScanId: baseline.scanId,
      changeType: event.changeType as never,
      severity: event.severity as never,
      summary: event.summary,
      addedItems: event.addedItems as never,
      removedItems: event.removedItems as never,
      beforeValue: event.beforeValue as never,
      afterValue: event.afterValue as never,
    })),
  });

  return events.length;
}
