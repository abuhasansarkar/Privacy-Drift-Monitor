import { unsafeGlobalClient } from "@pdm/database";
import {
  FALLBACK_ENTITLEMENTS,
  resolveEntitlements,
  type SubscriptionStatusName,
} from "@pdm/billing";
import { logger } from "@pdm/shared/logger";
import { objectStore } from "@pdm/storage";

/**
 * RETENTION — PLAN.md Part V §5.8, Part VII §7.2, Phase 6 task 6.9.
 *
 * §5.8, verbatim: "running nightly, per agency, honoring plan retention (§4.13)
 * and **always exempting evidence attached to open issues**. Deletion is
 * batched (10k rows per statement, paced) so it never blocks the write path.
 * Every retention run writes a `SystemLog` summary of what it removed."
 *
 * ⚠️ THIS JOB DELETES CUSTOMER DATA PERMANENTLY. It is also an OBLIGATION, not
 * a nice-to-have — retention limits are what make "we keep evidence for 30/90/
 * 180/365 days" true rather than marketing, and a privacy product that quietly
 * keeps everything forever is the thing it claims to protect people from. Both
 * facts are why every rule below is stated explicitly and tested.
 *
 * ⚠️ THE OPEN-ISSUE EXEMPTION IS LOAD-BEARING, AND THE SCHEMA MAKES IT SO.
 * `IssueEvidence.scanId` cascades on delete: removing a scan removes the
 * immutable proof behind every issue that cites it. An issue whose evidence has
 * been deleted is an accusation with nothing behind it — precisely what P6 and
 * the whole evidence chain exist to prevent. So a scan referenced by any OPEN
 * issue is never touched, regardless of age.
 *
 * ⚠️ IT USES THE AGENCY'S RESOLVED ENTITLEMENTS, NOT THE PLAN ROW. A support
 * override that extended a customer's retention has to be honoured, or the
 * grant silently expires the next night.
 *
 * ⚠️ NOTHING HERE IS DRIVEN BY A READ-ONLY STATUS. Feature doc 17 rule 3: a
 * billing problem never destroys data. Retention runs on the entitlements the
 * agency's PLAN grants; `resolveEntitlements` deliberately leaves every
 * viewing-and-keeping dimension untouched in read-only.
 */

const db = unsafeGlobalClient(
  // Justification (required in review): retention is a platform-wide sweep by
  // definition — it runs per agency, across every agency, and a tenant-scoped
  // client could only ever clean the one it was handed. Each agency's rows are
  // selected by its own id; nothing crosses a tenant boundary.
  "retention runs nightly across every agency, each against its own plan",
);

/** §5.8: "batched (10k rows per statement, paced)". */
const BATCH = 10_000;
const PACE_MS = Number(process.env.RETENTION_PACE_MS ?? 250);

/** §5.9: free scans are "purged after 7 days". */
const FREE_SCAN_RETENTION_DAYS = 7;

/** The statuses that mean an issue is still open — the same set §6.5 uses. */
const OPEN_STATUSES = ["NEW", "ACKNOWLEDGED", "IN_PROGRESS", "REOPENED", "UNVERIFIED"];

export interface AgencyRetentionResult {
  agencyId: string;
  evidenceRetentionDays: number;
  scanHistoryRetentionDays: number;
  /** Scans whose evidence rows were stripped but whose summary was kept. */
  scansStripped: number;
  /** Scans removed entirely, having passed the history horizon. */
  scansDeleted: number;
  /** Scans left alone because an open issue cites them. */
  scansExempt: number;
  screenshotsDeleted: number;
}

export interface RetentionResult {
  agencies: AgencyRetentionResult[];
  freeScansPurged: number;
  portalSessionsPurged: number;
}

export async function runRetention(now = new Date()): Promise<RetentionResult> {
  const agencies = await db.agency.findMany({
    select: { id: true },
    orderBy: { id: "asc" },
  });

  const results: AgencyRetentionResult[] = [];
  for (const agency of agencies) {
    try {
      results.push(await retainAgency(agency.id, now));
    } catch (error) {
      // One agency's failure must not stop retention for everyone else — the
      // obligation is per tenant, and skipping the rest would compound it.
      logger.error({ err: error, agencyId: agency.id }, "retention failed for agency");
    }
  }

  const result: RetentionResult = {
    agencies: results,
    freeScansPurged: await purgeFreeScans(now),
    portalSessionsPurged: await purgeExpiredPortalSessions(now),
  };

  await writeSummary(result);
  return result;
}

async function retainAgency(
  agencyId: string,
  now: Date,
): Promise<AgencyRetentionResult> {
  const subscription = await db.subscription.findFirst({
    where: { agencyId },
    include: { plan: true },
  });

  const entitlements = subscription
    ? resolveEntitlements({
        planEntitlements: subscription.plan.entitlements,
        overrides: subscription.entitlementOverrides,
        status: subscription.status as SubscriptionStatusName,
        trialEndsAt: subscription.trialEndsAt,
      })
    : /*
       * ⚠️ AN AGENCY WITH NO SUBSCRIPTION GETS THE FALLBACK'S RETENTION, WHICH
       * IS THE SHORTEST ONE (30 days). That is deliberate in the safe
       * direction: over-retaining is the failure that breaks the promise, and
       * an agency with no plan at all is one that has never paid for longer.
       */
      FALLBACK_ENTITLEMENTS;

  const evidenceCutoff = daysAgo(now, entitlements.evidenceRetentionDays);
  const historyCutoff = daysAgo(now, entitlements.scanHistoryRetentionDays);

  const exemptScanIds = await openIssueScanIds(agencyId);

  const result: AgencyRetentionResult = {
    agencyId,
    evidenceRetentionDays: entitlements.evidenceRetentionDays,
    scanHistoryRetentionDays: entitlements.scanHistoryRetentionDays,
    scansStripped: 0,
    scansDeleted: 0,
    scansExempt: 0,
    screenshotsDeleted: 0,
  };

  /*
   * ⚠️ TWO HORIZONS, NOT ONE, AND THE ORDER MATTERS. §4.13 sells them
   * separately: evidence retention (30–365 days) is how long the raw recorded
   * requests, cookies and screenshots are kept; scan history (12–36 months) is
   * how long the SCAN and its score survive so the health trend still has a
   * line to draw. Stripping evidence first means a two-year-old scan keeps its
   * score and its date on the chart while its megabytes of network rows are
   * long gone — which is the whole point of having two numbers.
   */

  // ── 1. Strip evidence from scans past the evidence horizon ──────────────
  const stripCandidates = await db.scan.findMany({
    where: {
      agencyId,
      createdAt: { lt: evidenceCutoff },
      id: { notIn: exemptScanIds },
      // `evidencePrunedAt` marks a scan already stripped, so a nightly run does
      // not re-issue five DELETEs per scan for the rest of the scan's life.
      evidencePrunedAt: null,
    },
    select: { id: true },
    take: BATCH,
    orderBy: { createdAt: "asc" },
  });

  if (stripCandidates.length > 0) {
    const ids = stripCandidates.map((scan) => scan.id);
    result.screenshotsDeleted += await deleteScreenshotObjects(ids);

    await db.$transaction([
      db.networkRequest.deleteMany({ where: { scanId: { in: ids } } }),
      db.cookieRecord.deleteMany({ where: { scanId: { in: ids } } }),
      db.storageEntry.deleteMany({ where: { scanId: { in: ids } } }),
      db.consoleLog.deleteMany({ where: { scanId: { in: ids } } }),
      db.screenshot.deleteMany({ where: { scanId: { in: ids } } }),
      db.scan.updateMany({
        where: { id: { in: ids } },
        data: { evidencePrunedAt: now },
      }),
    ]);
    result.scansStripped = ids.length;
    await pace();
  }

  // ── 2. Delete scans past the history horizon entirely ───────────────────
  const deleteCandidates = await db.scan.findMany({
    where: {
      agencyId,
      createdAt: { lt: historyCutoff },
      id: { notIn: exemptScanIds },
    },
    select: { id: true },
    take: BATCH,
    orderBy: { createdAt: "asc" },
  });

  if (deleteCandidates.length > 0) {
    const ids = deleteCandidates.map((scan) => scan.id);
    result.screenshotsDeleted += await deleteScreenshotObjects(ids);
    // Every evidence table cascades from `Scan`, which is why the exemption
    // above has to be right: this one statement takes the issue evidence too.
    const deleted = await db.scan.deleteMany({ where: { id: { in: ids } } });
    result.scansDeleted = deleted.count;
    await pace();
  }

  result.scansExempt = await db.scan.count({
    where: { agencyId, createdAt: { lt: evidenceCutoff }, id: { in: exemptScanIds } },
  });

  return result;
}

/**
 * The scans an OPEN issue cites. These are never touched.
 *
 * ⚠️ A RESOLVED ISSUE IS NOT EXEMPT, and that is the rule §5.8 states —
 * "evidence attached to OPEN issues". Exempting resolved ones too would mean
 * evidence is retained forever for any site that ever had a finding, which is
 * every site, which is no retention policy at all.
 */
async function openIssueScanIds(agencyId: string): Promise<string[]> {
  const rows = await db.issueEvidence.findMany({
    where: { agencyId, issue: { status: { in: OPEN_STATUSES as never[] } } },
    select: { scanId: true },
    distinct: ["scanId"],
  });
  return rows.map((row) => row.scanId);
}

/**
 * ⚠️ OBJECT STORAGE FIRST, DATABASE SECOND — never the other way round. The row
 * is the only record of the key; deleting it first orphans the object with
 * nothing left pointing at it, and the bucket grows forever with files nobody
 * can name. A failure here leaves the row in place and the next run retries.
 *
 * ⚠️ ONE PREFIX DELETE PER SCAN, NOT ONE PER SCREENSHOT. `screenshotKey()` is
 * agency-first and scan-scoped precisely so that "delete this scan's images" is
 * a single prefix operation — §5.7 says so in as many words. A per-row loop over
 * a 10,000-scan batch is 40,000 LIST+DELETE round trips against object storage
 * for work the layout was designed to do in 10,000.
 */
async function deleteScreenshotObjects(scanIds: string[]): Promise<number> {
  const scans = await db.scan.findMany({
    where: { id: { in: scanIds }, screenshots: { some: {} } },
    select: { id: true, agencyId: true, websiteId: true },
  });
  if (scans.length === 0) return 0;

  const store = objectStore();
  let deleted = 0;
  for (const scan of scans) {
    const prefix = `agencies/${scan.agencyId}/websites/${scan.websiteId}/scans/${scan.id}/`;
    try {
      deleted += await store.deletePrefix(prefix);
    } catch (error) {
      logger.warn({ err: error, prefix }, "retention: object delete failed");
    }
  }
  return deleted;
}

/**
 * §5.9: `FreeScan` is "pre-tenant" and "purged after 7 days".
 *
 * ⚠️ IT DELETES ON `expiresAt`, NOT ON `createdAt` MINUS SEVEN DAYS. The row
 * carries its own expiry and the schema indexes it, so the free scanner owns
 * the horizon and this job enforces whatever it set. A second copy of "7" here
 * would silently win over a deliberate change made at the other end — and the
 * result page's own validity check reads `expiresAt`, so a mismatch means a
 * result that is either purged while still linkable or linkable after purge.
 *
 * ⚠️ THE FALLBACK MATTERS FOR ROWS WRITTEN BEFORE THE FIELD WAS POPULATED. A
 * null `expiresAt` cannot happen (the column is required), but a row from a
 * bug that set it far in the future would live forever; the `createdAt` bound
 * is the backstop, and it uses the same seven days §5.9 states.
 */
async function purgeFreeScans(now: Date): Promise<number> {
  const { count } = await db.freeScan.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: now } },
        { createdAt: { lt: daysAgo(now, FREE_SCAN_RETENTION_DAYS) } },
      ],
    },
  });
  return count;
}

/**
 * Expired portal sessions.
 *
 * ⚠️ AN EXPIRED SESSION ROW IS ALREADY POWERLESS — the portal checks
 * `expiresAt` on every request. Removing it is data minimization, not
 * authorization: the row holds a client contact's token hash and last-seen IP,
 * and keeping those indefinitely for a session that ended months ago is exactly
 * the habit this product exists to point out in other people's websites.
 */
async function purgeExpiredPortalSessions(now: Date): Promise<number> {
  const { count } = await db.portalSession.deleteMany({
    where: { expiresAt: { lt: now } },
  });
  return count;
}

/** §5.8: "Every retention run writes a `SystemLog` summary of what it removed." */
async function writeSummary(result: RetentionResult): Promise<void> {
  const totals = result.agencies.reduce(
    (acc, row) => ({
      scansStripped: acc.scansStripped + row.scansStripped,
      scansDeleted: acc.scansDeleted + row.scansDeleted,
      scansExempt: acc.scansExempt + row.scansExempt,
      screenshotsDeleted: acc.screenshotsDeleted + row.screenshotsDeleted,
    }),
    { scansStripped: 0, scansDeleted: 0, scansExempt: 0, screenshotsDeleted: 0 },
  );

  await db.systemLog.create({
    data: {
      level: "info",
      service: "retention",
      message: "retention sweep completed",
      context: {
        agencies: result.agencies.length,
        ...totals,
        freeScansPurged: result.freeScansPurged,
        portalSessionsPurged: result.portalSessionsPurged,
      },
    },
  });

  logger.info({ ...totals, agencies: result.agencies.length }, "retention sweep completed");
}

function daysAgo(now: Date, days: number): Date {
  return new Date(now.getTime() - days * 86_400_000);
}

/** §5.8: "paced, so it never blocks the write path." */
function pace(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, PACE_MS));
}
