import { unsafeGlobalClient } from "@pdm/database";
import {
  GRACE_DAYS,
  countToPause,
  isReadOnly,
  resolveEntitlements,
  resolveGrace,
  selectSitesToPause,
  type SubscriptionStatusName,
} from "@pdm/billing";
import { enqueueEmail, type EmailJobData } from "@pdm/scanner/queue/queues";
import { logger } from "@pdm/shared/logger";
import type { Queue } from "bullmq";

/**
 * GRACE SWEEP — PLAN.md Part IX §9.2, Phase 6 task 6.2.
 *
 * §9.2's downgrade rule, executed: an agency over its website limit gets 14
 * days, then its oldest excess sites are PAUSED — never deleted, never archived
 * — and told which ones by email.
 *
 * ⚠️ EVERY DECISION IS MADE IN `@pdm/billing`, WHICH HAS NO DATABASE. This file
 * reads rows, calls `resolveGrace` / `selectSitesToPause`, and writes what they
 * say. That split is why "we never delete a site" is provable in a unit test
 * rather than by reading a job that also does I/O.
 *
 * ⚠️ IT PAUSES, IT NEVER ARCHIVES. `monitoringStatus: PAUSED` keeps the site
 * counting toward the limit, which is what makes the state visible and
 * reversible. Archiving would free the slot — the overage would vanish, the
 * banner would disappear, and the customer would never learn that we removed
 * four sites from their portfolio view.
 *
 * ⚠️ IT SKIPS AGENCIES ALREADY IN READ-ONLY. A PAST_DUE agency is not being
 * punished twice: its scanning is already stopped, so pausing its sites adds
 * nothing but a confusing second email at the worst possible moment.
 */

const db = unsafeGlobalClient(
  // Justification (required in review): the grace sweep is a platform-wide job
  // by definition — it looks for agencies over their limit, which cannot be
  // known one tenant at a time. It only ever reads and writes rows belonging to
  // the agency currently being processed.
  "grace sweep evaluates every agency's website count against its own plan",
);

export interface GraceOutcome {
  agencyId: string;
  state: "clear" | "grace" | "expired";
  excess: number;
  /** Ids of sites paused on THIS run. Empty unless the window had elapsed. */
  paused: string[];
}

export interface GraceSweepResult {
  agenciesChecked: number;
  entered: number;
  cleared: number;
  paused: number;
  outcomes: GraceOutcome[];
}

export async function sweepGrace(
  emailQueue: Queue<EmailJobData> | null,
  now = new Date(),
): Promise<GraceSweepResult> {
  /*
   * ⚠️ ONLY AGENCIES WITH A SUBSCRIPTION ROW ARE SWEPT, and that is the whole
   * population this rule is about: §9.2's grace exists for a DOWNGRADE, and an
   * agency that has never subscribed has never downgraded. It is also capped at
   * the fallback allowance by the same entitlement guard that governs everyone
   * else, so it cannot accumulate an overage in the first place — and pausing
   * sites belonging to an agency we have never billed would be hostile.
   */
  const subscriptions = await db.subscription.findMany({
    include: { plan: true },
    orderBy: { agencyId: "asc" },
  });

  const result: GraceSweepResult = {
    agenciesChecked: 0,
    entered: 0,
    cleared: 0,
    paused: 0,
    outcomes: [],
  };

  for (const subscription of subscriptions) {
    const status = subscription.status as SubscriptionStatusName;
    if (isReadOnly(status)) continue;

    result.agenciesChecked += 1;

    const entitlements = resolveEntitlements({
      planEntitlements: subscription.plan.entitlements,
      overrides: subscription.entitlementOverrides,
      status,
      trialEndsAt: subscription.trialEndsAt,
    });

    /*
     * ⚠️ THE SAME COUNT THE ENTITLEMENT SERVICE USES: active, non-archived
     * sites. A different count here would let the sweep pause sites over a
     * limit the billing page says the agency is under.
     *
     * ⚠️ PAUSED SITES STILL COUNT. They are the ones a previous sweep paused;
     * excluding them would make the agency look compliant, clear the grace
     * clock, and start the whole cycle again next time it went over.
     */
    const sites = await db.website.findMany({
      where: { agencyId: subscription.agencyId, archivedAt: null },
      select: { id: true, createdAt: true, label: true, url: true, monitoringStatus: true },
      orderBy: { createdAt: "asc" },
    });

    const grace = resolveGrace({
      websiteCount: sites.length,
      maxWebsites: entitlements.maxWebsites,
      graceStartedAt: subscription.graceStartedAt,
      now,
    });

    const outcome: GraceOutcome = {
      agencyId: subscription.agencyId,
      state: grace.state,
      excess: grace.excess,
      paused: [],
    };

    try {
      if (grace.state === "clear") {
        if (subscription.graceStartedAt) {
          await db.subscription.update({
            where: { id: subscription.id },
            data: { graceStartedAt: null },
          });
          result.cleared += 1;
        }
      } else if (grace.state === "grace") {
        if (!subscription.graceStartedAt) {
          // First sighting: start the clock and tell them, while there is still
          // time for the message to change the outcome.
          await db.subscription.update({
            where: { id: subscription.id },
            data: { graceStartedAt: now },
          });
          result.entered += 1;
          await notifyOwner(emailQueue, subscription.agencyId, {
            template: "grace-started",
            data: { excess: grace.excess, days: GRACE_DAYS },
          });
        }
      } else {
        /*
         * ⚠️ ONLY SITES THAT ARE STILL ACTIVE ARE CANDIDATES. Re-pausing what a
         * previous run already paused would send the same email every night
         * forever — the sweep is idempotent because the set of candidates
         * shrinks as it acts.
         */
        const candidates = sites.filter((site) => site.monitoringStatus === "ACTIVE");
        /*
         * ⚠️ `countToPause`, NOT `grace.excess`. See the note on that function:
         * `excess` counts paused sites too (they still hold a plan slot), so
         * reusing it here paused the remaining two sites on the second night
         * and the agency's entire portfolio by the third.
         */
        const toPause = selectSitesToPause(
          candidates,
          countToPause(candidates.length, entitlements.maxWebsites),
        );

        if (toPause.length > 0) {
          await db.website.updateMany({
            where: { id: { in: toPause.map((site) => site.id) } },
            data: {
              monitoringStatus: "PAUSED",
              /*
               * ⚠️ `nextScanAt: null` OR THE SCHEDULER KEEPS PICKING IT UP. The
               * sweep filters on `monitoringStatus: ACTIVE`, so this is belt and
               * braces — but a paused site with a due date is a row that starts
               * scanning again the instant anyone flips the status back without
               * thinking about the date.
               */
              nextScanAt: null,
            },
          });
          outcome.paused = toPause.map((site) => site.id);
          result.paused += toPause.length;

          await notifyOwner(emailQueue, subscription.agencyId, {
            template: "grace-paused",
            data: {
              limit: entitlements.maxWebsites,
              count: toPause.length,
              // `toPause` is a subset of `candidates`, so the rows already
              // carry their own label — no second lookup, and no chance of the
              // email naming a different site than the one that was paused.
              siteLabels: toPause.map((site) => site.label ?? site.url),
            },
          });

          logger.warn(
            { agencyId: subscription.agencyId, paused: toPause.length },
            "grace expired: paused oldest excess websites",
          );
        }
      }
    } catch (error) {
      // One agency's failure must not stop the sweep for everyone else.
      logger.error(
        { err: error, agencyId: subscription.agencyId },
        "grace sweep failed for agency",
      );
    }

    result.outcomes.push(outcome);
  }

  return result;
}

/**
 * §9.5 sends billing mail to the Owner.
 *
 * ⚠️ THE IDEMPOTENCY KEY INCLUDES THE DAY, not a random id. §9.5 checks it
 * against `AlertHistory` before dispatch, so a sweep that runs twice in one day
 * — a restart, a manual invocation — sends one email, and a genuine second
 * event tomorrow still gets through.
 */
async function notifyOwner(
  emailQueue: Queue<EmailJobData> | null,
  agencyId: string,
  message: { template: string; data: Record<string, unknown> },
): Promise<void> {
  if (!emailQueue) return;

  const owner = await db.agencyMember.findFirst({
    where: { agencyId, role: "OWNER", status: "ACTIVE" },
    include: { user: { select: { id: true, email: true } } },
  });
  if (!owner?.user.email) {
    logger.warn({ agencyId }, "grace: no owner to notify");
    return;
  }

  const day = new Date().toISOString().slice(0, 10);
  await enqueueEmail(emailQueue, {
    agencyId,
    message: message as unknown,
    to: owner.user.email,
    userId: owner.user.id,
    alertRuleId: null,
    notificationType: null,
    entityType: "grace",
    entityId: null,
    idempotencyKey: `grace-${message.template}-${agencyId}-${day}`,
  });
}
