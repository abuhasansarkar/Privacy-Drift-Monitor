import type { Issue, IssueCategory, Prisma, Severity } from "@prisma/client";
import type { TenantClient } from "../tenant";
import { skipTake, toOffsetPage, type OffsetPage } from "./types";

/**
 * ISSUE REPOSITORY — PLAN.md Part VI §6.5, Phase 3 tasks 3.4/3.5.
 *
 * ⚠️ ISSUES DEDUPLICATE ON A FINGERPRINT, NOT ON IDENTITY (§3.4). The same
 * finding seen in tonight's scan and last night's is ONE issue with
 * `occurrenceCount: 2` — not two. Getting this wrong does not look like a bug:
 * it looks like an alert storm, and the agency stops reading alerts.
 *
 * ⚠️ AN IGNORED ISSUE IS NEVER RECREATED. Suppression happens at CREATION time,
 * not at render time (§3.5). An issue filtered out of a list still exists to
 * alert, to count towards the score and to reappear in a report — which is
 * exactly the "I told you to ignore this" complaint that erodes trust.
 *
 * ⚠️ A RESOLVED ISSUE THAT RECURS BECOMES `REOPENED`, never a fresh `NEW`. The
 * history is the point: "you fixed this and it came back" is a materially
 * different message from "here is a new problem".
 */

export interface FindingInput {
  ruleId: string;
  ruleVersion: number;
  fingerprint: string;
  category: IssueCategory;
  severity: Severity;
  confidence: number;
  title: string;
  message: string;
  technicalReason: string;
  recommendedAction: string;
}

/**
 * One recorded row a finding was derived from, ready to become `IssueEvidence`.
 *
 * ⚠️ WHY THIS EXISTS, AND WHY IT ARRIVED LATE. §5.6 lists "insert
 * `IssueEvidence`" in the scan-completion transaction, and §0.2 P2 makes those
 * rows the anchor every AI citation must resolve to. Phase 3 built the rule
 * engine's `Finding.evidenceRefs` but never persisted them, so the table had no
 * writer and Phase 5's grounding check had nothing to check against — the
 * validator would have rejected every output, correctly and uselessly. This
 * type and the insert below are the missing half.
 *
 * ⚠️ THE PAYLOAD IS A SUMMARY, NOT A COPY. The full row already lives in
 * `network_requests` / `cookie_records` / `storage_entries`; duplicating it
 * would double the largest tables in the database and create two versions of
 * one fact. What is stored is the identifying fields plus a pointer, which is
 * what both the evidence viewer and the AI context builder need.
 */
export interface EvidenceInput {
  kind:
    | "NETWORK_REQUEST"
    | "COOKIE"
    | "STORAGE_ENTRY"
    | "SCREENSHOT"
    | "CONSOLE_ERROR"
    | "CONSENT_ACTION"
    | "DRIFT_DIFF";
  pageUrl: string;
  consentPhase: string;
  observedAtMs: number;
  confidence: number;
  /** The identifying fields, shaped for `summariseEvidence()` in `@pdm/ai`. */
  payload: Prisma.InputJsonValue;
}

/** A finding plus the rows behind it. */
export interface FindingWithEvidence extends FindingInput {
  evidence: readonly EvidenceInput[];
}

export interface UpsertResult {
  created: number;
  updated: number;
  reopened: number;
  suppressed: number;
}

/** Statuses that mean "the user has dealt with this". A recurrence reopens. */
const CLOSED: readonly string[] = ["RESOLVED", "VERIFIED"];

/**
 * Strips `evidence` before the finding is spread into `issue.create`.
 *
 * ⚠️ WITHOUT THIS, `...finding` HANDS PRISMA AN UNKNOWN COLUMN and the create
 * throws at runtime — the whole scan's reconcile transaction rolls back, on a
 * field that only exists on some of the union's members. Spreading a
 * caller-supplied object into a `data` block is the seam; naming the columns is
 * the fix.
 */
function toIssueColumns(finding: FindingInput | FindingWithEvidence): FindingInput {
  return {
    ruleId: finding.ruleId,
    ruleVersion: finding.ruleVersion,
    fingerprint: finding.fingerprint,
    category: finding.category,
    severity: finding.severity,
    confidence: finding.confidence,
    title: finding.title,
    message: finding.message,
    technicalReason: finding.technicalReason,
    recommendedAction: finding.recommendedAction,
  };
}

export function issueRepository(db: TenantClient, agencyId: string) {
  return {
    /**
     * Reconciles a scan's findings against the website's existing issues.
     *
     * ⚠️ ONE TRANSACTION per scan, not per finding. A half-applied reconcile
     * leaves some issues stamped with the new scan and others not, and the next
     * run then treats the un-stamped ones as newly resolved.
     */
    async upsertFromScan(params: {
      websiteId: string;
      scanId: string;
      detectedAt: Date;
      findings: readonly (FindingInput | FindingWithEvidence)[];
    }): Promise<UpsertResult> {
      const result: UpsertResult = {
        created: 0,
        updated: 0,
        reopened: 0,
        suppressed: 0,
      };

      // Ignore rules are read ONCE, outside the loop: they change rarely and
      // re-reading per finding would be a query per row.
      const now = params.detectedAt;
      const ignoreRules = await db.ignoreRule.findMany({
        where: {
          OR: [{ websiteId: params.websiteId }, { websiteId: null }],
          // An expired suppression stops suppressing. A "mute for 30 days"
          // that never wakes up is just a deletion with extra steps.
          AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }],
        },
        select: { ruleId: true, fingerprint: true },
      });

      const ignoredFingerprints = new Set(
        ignoreRules.map((rule) => rule.fingerprint).filter(Boolean) as string[],
      );
      // A rule-scoped suppression (no fingerprint) mutes every finding from
      // that rule; a fingerprint-scoped one mutes exactly one finding.
      const ignoredRuleIds = new Set(
        ignoreRules
          .filter((rule) => !rule.fingerprint && rule.ruleId)
          .map((rule) => rule.ruleId as string),
      );

      await db.$transaction(async (tx) => {
        /**
         * §5.6's "insert `IssueEvidence`", inside the same transaction as the
         * issue it proves.
         *
         * ⚠️ DELETE-THEN-INSERT PER (issue, scan), NOT A BLIND INSERT. Analysis
         * is replayable by design (P6, §4.14: "re-run rules over stored
         * evidence"), and a blind insert would double the evidence on every
         * replay — which would inflate `occurrenceCount`-adjacent reads, break
         * the ≤8 selection in `@pdm/ai` by burying the real rows under
         * duplicates, and be invisible until someone counted. Scoping the
         * delete to THIS scan keeps every earlier scan's evidence intact, which
         * is what makes the table the immutable proof §5 calls it.
         */
        const writeEvidence = async (
          issueId: string,
          finding: FindingInput | FindingWithEvidence,
        ) => {
          const rows = "evidence" in finding ? finding.evidence : [];
          if (rows.length === 0) return;

          await tx.issueEvidence.deleteMany({
            where: { issueId, scanId: params.scanId },
          });
          await tx.issueEvidence.createMany({
            data: rows.map((row) => ({
              issueId,
              scanId: params.scanId,
              agencyId,
              kind: row.kind,
              pageUrl: row.pageUrl,
              consentPhase: row.consentPhase as never,
              observedAtMs: row.observedAtMs,
              detectionRuleId: finding.ruleId,
              detectionRuleVersion: finding.ruleVersion,
              confidence: row.confidence,
              payload: row.payload,
            })),
          });
        };

        for (const finding of params.findings) {
          // Suppressed at CREATION. See the header note.
          if (
            ignoredFingerprints.has(finding.fingerprint) ||
            ignoredRuleIds.has(finding.ruleId)
          ) {
            result.suppressed += 1;
            continue;
          }

          const existing = await tx.issue.findFirst({
            where: { websiteId: params.websiteId, fingerprint: finding.fingerprint },
          });

          if (!existing) {
            const created = await tx.issue.create({
              data: {
                agencyId,
                websiteId: params.websiteId,
                firstScanId: params.scanId,
                lastScanId: params.scanId,
                firstDetectedAt: params.detectedAt,
                lastSeenAt: params.detectedAt,
                occurrenceCount: 1,
                status: "NEW",
                ...toIssueColumns(finding),
              },
            });
            await writeEvidence(created.id, finding);
            result.created += 1;
            continue;
          }

          // An issue the user explicitly ignored stays ignored, even though the
          // behaviour is still happening. That is what ignoring means.
          if (existing.status === "IGNORED") {
            result.suppressed += 1;
            continue;
          }

          const reopening = CLOSED.includes(existing.status);

          await tx.issue.update({
            where: { id: existing.id },
            data: {
              lastScanId: params.scanId,
              lastSeenAt: params.detectedAt,
              occurrenceCount: { increment: 1 },
              // Severity CAN move: the same tracker corroborated this time is a
              // stronger claim than last time, and the issue should say so.
              severity: finding.severity,
              confidence: finding.confidence,
              ...(reopening
                ? {
                    status: "REOPENED",
                    // The resolution is cleared, not kept: it was not correct.
                    resolvedAt: null,
                    resolvedById: null,
                    resolution: null,
                  }
                : {}),
            },
          });

          // ⚠️ EVIDENCE IS WRITTEN ON EVERY SIGHTING, not only at creation. An
          // issue seen across ten scans must carry ten scans' proof: "when did
          // this last actually happen" is answered by the evidence, and an
          // issue whose only evidence is from its first scan cannot answer it.
          await writeEvidence(existing.id, finding);

          if (reopening) result.reopened += 1;
          else result.updated += 1;
        }
      });

      return result;
    },

    /**
     * Issues present in an earlier scan but ABSENT from this one.
     *
     * ⚠️ NOT called after a PARTIAL scan. A journey that did not run produces no
     * findings, and treating that silence as "the problem went away" would
     * auto-resolve real issues on every incomplete scan — the most damaging
     * false negative available to this system (P5).
     */
    async markResolvedIfAbsent(params: {
      websiteId: string;
      scanId: string;
      seenFingerprints: readonly string[];
      resolvedAt: Date;
    }): Promise<number> {
      const { count } = await db.issue.updateMany({
        where: {
          websiteId: params.websiteId,
          fingerprint: { notIn: [...params.seenFingerprints] },
          status: { in: ["NEW", "ACKNOWLEDGED", "IN_PROGRESS", "REOPENED"] },
        },
        data: {
          status: "RESOLVED",
          resolvedAt: params.resolvedAt,
          resolution: "FIXED",
          verificationScanId: params.scanId,
        },
      });
      return count;
    },

    /**
     * VERIFICATION — §6.5, Phase 4 task 4.7.
     *
     * A verification scan ran, and the finding a user marked RESOLVED did not
     * come back. `RESOLVED` is the user's claim; `VERIFIED` is ours, and the
     * difference is what makes a resolved issue defensible in a client report.
     *
     * ⚠️ ONLY ON A COMPLETE SCAN, enforced by the caller. A PARTIAL scan
     * produces no findings for the journeys that did not run, and treating that
     * silence as proof of a fix would stamp VERIFIED on issues nobody re-tested
     * — the same rule that keeps PARTIAL out of the drift baseline (P5, §4.10).
     */
    async verifyResolved(params: {
      websiteId: string;
      scanId: string;
      seenFingerprints: readonly string[];
      verifiedAt: Date;
    }): Promise<number> {
      const { count } = await db.issue.updateMany({
        where: {
          websiteId: params.websiteId,
          fingerprint: { notIn: [...params.seenFingerprints] },
          status: "RESOLVED",
          /*
           * ⚠️ EXCLUDES ISSUES THIS SAME SCAN JUST AUTO-RESOLVED.
           * `markResolvedIfAbsent` stamps `verificationScanId` with the scan
           * that resolved them; one scan cannot be both the claim and the
           * proof. Written as an explicit OR because `{ not: id }` on a
           * nullable column drops NULL rows in SQL — and NULL is exactly the
           * case that matters here: an issue a PERSON marked resolved.
           */
          OR: [
            { verificationScanId: null },
            { verificationScanId: { not: params.scanId } },
          ],
        },
        data: {
          status: "VERIFIED",
          verifiedAt: params.verifiedAt,
          verificationScanId: params.scanId,
        },
      });
      return count;
    },

    /**
     * Issues awaiting verification on this website.
     *
     * Used to decide whether a verification scan is worth queueing at all — a
     * browser slot is the scarcest resource in the system (§7.7), and scanning
     * to verify nothing is the easiest way to waste one.
     */
    async countAwaitingVerification(websiteId: string): Promise<number> {
      return db.issue.count({ where: { websiteId, status: "RESOLVED" } });
    },

    async list(params: {
      status?: string[];
      severity?: Severity[];
      websiteId?: string;
      clientId?: string;
      search?: string;
      page: number;
      perPage: number;
    }): Promise<OffsetPage<Issue & { website: { id: string; url: string } }>> {
      const where: Prisma.IssueWhereInput = {
        // IGNORED is excluded by default: it is suppressed, not deleted, and
        // showing it in the queue defeats the point of ignoring it.
        status: params.status
          ? { in: params.status as never }
          : { notIn: ["IGNORED"] },
        ...(params.severity ? { severity: { in: params.severity } } : {}),
        ...(params.websiteId ? { websiteId: params.websiteId } : {}),
        ...(params.clientId ? { website: { clientId: params.clientId } } : {}),
        ...(params.search
          ? { title: { contains: params.search, mode: "insensitive" as const } }
          : {}),
      };

      const [total, items] = await Promise.all([
        db.issue.count({ where }),
        db.issue.findMany({
          where,
          include: { website: { select: { id: true, url: true } } },
          // Severity first, then recency: the queue is a work list, and a
          // critical from last week outranks an info from this morning.
          orderBy: [{ severity: "asc" }, { lastSeenAt: "desc" }],
          ...skipTake(params),
        }),
      ]);

      return toOffsetPage(items, total, params);
    },

    async findById(id: string) {
      return db.issue.findUnique({
        where: { id },
        include: {
          website: { select: { id: true, url: true, clientId: true } },
          evidence: true,
        },
      });
    },

    async countsBySeverity(): Promise<Record<string, number>> {
      const groups = await db.issue.groupBy({
        by: ["severity"],
        where: { status: { notIn: ["IGNORED", "RESOLVED", "VERIFIED"] } },
        _count: { _all: true },
      });
      return Object.fromEntries(
        groups.map((group) => [group.severity, group._count._all]),
      );
    },

    /** Status transitions. Audited by the caller, which holds the actor. */
    async setStatus(
      id: string,
      status: "ACKNOWLEDGED" | "IN_PROGRESS" | "RESOLVED",
      actorId: string,
    ): Promise<Issue | null> {
      const existing = await db.issue.findUnique({ where: { id } });
      if (!existing) return null;

      return db.issue.update({
        where: { id },
        data: {
          status,
          ...(status === "ACKNOWLEDGED"
            ? { acknowledgedAt: new Date(), acknowledgedById: actorId }
            : {}),
          ...(status === "RESOLVED"
            ? { resolvedAt: new Date(), resolvedById: actorId, resolution: "FIXED" }
            : {}),
        },
      });
    },

    /**
     * Active suppressions, for the settings page.
     *
     * ⚠️ THIS PAGE IS WHY IGNORING IS SAFE. A suppression with no surface that
     * lists it is a permanent silent hole in the monitoring — six months on,
     * nobody knows why a site stopped reporting a finding. Being able to see
     * and revoke them is what makes "ignore" a decision rather than a leak.
     */
    async listIgnoreRules(now: Date) {
      return db.ignoreRule.findMany({
        where: { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
        // `createdById` has no relation on IgnoreRule — the page resolves the
        // name separately rather than the schema growing a foreign key for one
        // settings screen.
        include: { website: { select: { id: true, url: true } } },
        orderBy: { createdAt: "desc" },
      });
    },

    /**
     * Revokes a suppression by deleting it.
     *
     * ⚠️ The ISSUE is not reopened here. The finding reappears on the next scan
     * that observes the behaviour — which is the honest sequence: we do not
     * know the tracker is still there until we look again. Resurrecting the old
     * issue would assert a fact from a stale scan (P1).
     */
    async revokeIgnoreRule(id: string): Promise<boolean> {
      const { count } = await db.ignoreRule.deleteMany({ where: { id } });
      return count > 0;
    },

    /**
     * Ignoring requires a REASON (§6.5) — it is a decision someone else will
     * have to understand later, and an unexplained suppression is
     * indistinguishable from a missed finding.
     */
    async ignore(id: string, actorId: string, reason: string): Promise<Issue | null> {
      const existing = await db.issue.findUnique({ where: { id } });
      if (!existing) return null;

      return db.$transaction(async (tx) => {
        const issue = await tx.issue.update({
          where: { id },
          data: {
            status: "IGNORED",
            ignoredAt: new Date(),
            ignoredById: actorId,
            ignoreReason: reason,
          },
        });

        // The rule that stops it being recreated on the next scan. Without
        // this row, the reconcile above would raise it again tonight.
        await tx.ignoreRule.create({
          data: {
            agencyId,
            websiteId: issue.websiteId,
            // Fingerprint-scoped: ignoring THIS finding, not every finding the
            // rule can produce. Muting a whole rule is a separate, deliberate
            // action on the settings page.
            scope: "FINGERPRINT",
            ruleId: issue.ruleId,
            fingerprint: issue.fingerprint,
            reason,
            createdById: actorId,
          },
        });

        return issue;
      });
    },
  };
}

export type IssueRepository = ReturnType<typeof issueRepository>;
