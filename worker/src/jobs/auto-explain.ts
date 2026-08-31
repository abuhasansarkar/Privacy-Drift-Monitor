import type { Queue } from "bullmq";
import { repositoriesFor } from "@pdm/database/repositories";
import { enqueueAi, type AiJobData } from "@pdm/scanner/queue/queues";
import { FLAGS, FLAG_DEFAULTS } from "@pdm/shared/flags";
import { childLogger } from "@pdm/shared/logger";

/**
 * AUTO-EXPLAIN — PLAN.md Part VIII §8.5 feature 1, §8.9, Phase 5 task 5.6.
 *
 * The only path that spends AI credits with nobody at the keyboard, which is
 * why almost every line below is a reason NOT to spend.
 *
 * ⚠️ THREE INDEPENDENT SWITCHES MUST ALL BE ON, and they are checked in
 * increasing cost order:
 *
 *   1. `AI_AUTO_EXPLAIN`      — the flag. §11.13 and feature doc 16 both call
 *                               it an incident KILL SWITCH: "off stops all
 *                               automatic AI spend instantly". It is checked
 *                               FIRST and it is checked HERE, because this is
 *                               the only place the word "instantly" can be made
 *                               true — a flag consulted downstream of the
 *                               enqueue would still fill a queue.
 *   2. `aiEnabled`            — the agency's own switch.
 *   3. `autoExplainCritical`  — the opt-in. ⚠️ AN ABSENT SETTINGS ROW COUNTS AS
 *                               "NOT OPTED IN", even though the schema column
 *                               defaults to `true`. Feature doc 16 calls this
 *                               "the main uncontrolled cost vector"; an agency
 *                               that has never opened the settings page has not
 *                               agreed to anything. `shouldAutoExplain()` in
 *                               `src/server/services/ai.ts` resolves it the
 *                               same way, and the settings form renders the
 *                               checkbox unchecked to match.
 *
 * ⚠️ CRITICAL ONLY, AND ONLY WHAT IS NEW. §8.9: "Only Critical issues
 * auto-explain … avoids paying to explain issues no one opens." Re-explaining
 * an issue seen in every scan for a month would multiply that spend by the scan
 * frequency for no new information — the explanation has not changed, and if
 * somebody asks for it the cache serves it free.
 */

/** ⚠️ A HARD CEILING PER SCAN. A site that suddenly reports forty Critical
 *  findings is a scanner or rule regression far more often than it is forty
 *  real problems, and the auto-explain path must not turn that regression into
 *  a forty-call bill before anyone has looked at it. The rest are explained
 *  on demand, free of this cap. */
const MAX_AUTO_EXPLAIN_PER_SCAN = 5;

export async function enqueueAutoExplain(
  agencyId: string,
  scanId: string,
  queue: Queue<AiJobData>,
  options: { flagEnabled?: boolean } = {},
): Promise<number> {
  const log = childLogger({ agencyId, scanId, component: "auto-explain" });

  // 1. The kill switch, checked before any query runs.
  const flagEnabled = options.flagEnabled ?? FLAG_DEFAULTS[FLAGS.AI_AUTO_EXPLAIN];
  if (!flagEnabled) return 0;

  const repos = repositoriesFor(agencyId);

  // 2 + 3. The agency's switches. One read, and it short-circuits the rest.
  const settings = await repos.ai.settings();
  if (!settings?.aiEnabled || !settings.autoExplainCritical) return 0;

  /*
   * ⚠️ `status: "NEW"` IS WHAT MAKES THIS "ONLY WHAT IS NEW". An issue seen
   * before is ACKNOWLEDGED, IN_PROGRESS or REOPENED by now; only a genuinely
   * first-seen finding is still NEW, and `lastScanId` pins it to this scan so a
   * NEW issue from last week is not picked up again by today's run.
   */
  const issues = await repos.db.issue.findMany({
    where: { lastScanId: scanId, severity: "CRITICAL", status: "NEW" },
    select: { id: true, websiteId: true },
    orderBy: { createdAt: "asc" },
    take: MAX_AUTO_EXPLAIN_PER_SCAN,
  });

  for (const issue of issues) {
    await enqueueAi(queue, {
      agencyId,
      feature: "EXPLAIN_ISSUE",
      entityType: "issue",
      entityId: issue.id,
      issueId: issue.id,
      // ⚠️ NULL: nobody requested this. A userId here would attribute an
      // automatic charge to whoever happened to trigger the scan.
      userId: null,
      /*
       * ⚠️ THE IDEMPOTENCY KEY, and it is per (issue, feature) rather than per
       * (issue, feature, scan). A re-run of analysis over the same scan — which
       * §4.14 makes an ordinary operation — must not commission the same
       * explanation twice. The `inputHash` cache catches the case where the job
       * has already drained; this catches the case where it has not.
       */
      dedupeKey: `${agencyId}:EXPLAIN_ISSUE:${issue.id}`,
    });
  }

  if (issues.length > 0) {
    log.info({ count: issues.length }, "auto-explain jobs enqueued");
  }
  return issues.length;
}
