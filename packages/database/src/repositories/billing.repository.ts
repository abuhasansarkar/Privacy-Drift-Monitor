import type { Prisma } from "@prisma/client";
import type { TenantClient } from "../tenant";

/**
 * BILLING REPOSITORY — PLAN.md Part IX §9.2, Phase 6 task 6.2.
 *
 * Reads the subscription and its plan, and does the atomic usage arithmetic.
 * It holds no plan LOGIC — resolution lives in `@pdm/billing`, which is pure
 * and has no database. §9.2: "One service. No plan logic anywhere else."
 */

export function billingRepository(db: TenantClient, agencyId: string) {
  return {
    /**
     * The subscription with its plan, or `null` for an agency that has none.
     *
     * ⚠️ `Subscription` and `Plan` are read together on purpose. Resolution
     * needs the plan's entitlements AND the subscription's status and overrides
     * in the same instant; fetching them separately opens a window where a
     * webhook changes the status between the two reads and the agency is
     * resolved against a plan it no longer has.
     */
    async subscription() {
      return db.subscription.findFirst({ include: { plan: true } });
    },

    /**
     * Live counts for the COUNTED metrics (§9.2).
     *
     * ⚠️ `COUNT(*)`, NOT A STORED COUNTER. Archiving a website frees a slot and
     * removing a member frees a seat; a `UsageRecord` would never learn either,
     * so an agency that cleaned up would stay stuck at its limit forever. The
     * denormalised counters on `Website` exist for display and are reconciled
     * separately (§9.2's reconciliation job) — they are not the entitlement
     * source of truth.
     *
     * ⚠️ ARCHIVED WEBSITES DO NOT COUNT. A paused or archived site consumes no
     * scan budget, so charging a plan slot for it would mean the only way to
     * get under a limit after a downgrade is deletion — and §9.2 is explicit
     * that grace "auto-pauses, never deletes".
     */
    async liveCounts(): Promise<{ websites: number; seats: number; clients: number }> {
      const [websites, seats, clients] = await Promise.all([
        db.website.count({ where: { archivedAt: null } }),
        db.agencyMember.count({ where: { status: "ACTIVE" } }),
        db.client.count({ where: { archivedAt: null } }),
      ]);
      return { websites, seats, clients };
    },

    /** Consumption recorded so far in one billing period. */
    async usageInPeriod(periodStart: Date) {
      return db.usageRecord.findMany({ where: { periodStart } });
    },

    async usageFor(periodStart: Date, metric: string): Promise<number> {
      const row = await db.usageRecord.findFirst({
        where: { periodStart, metric: metric as never },
      });
      return row?.quantity ?? 0;
    },

    /**
     * Records consumption. Returns the new total.
     *
     * ⚠️ `{ increment }` INSIDE AN UPSERT, KEYED ON THE UNIQUE CONSTRAINT.
     * §9.2: "Usage counters are `UsageRecord` rows upserted with an atomic
     * `increment`, keyed `(agencyId, periodStart, metric)` — the unique
     * constraint makes double-counting impossible under concurrency."
     *
     * Both halves matter and neither is sufficient alone:
     *
     *   - `increment` rather than reading `quantity` and writing `quantity + n`.
     *     The read-then-write is a lost update the moment two workers
     *     interleave, and the symptom is an agency that ran 400 scans being
     *     billed for 380 — plausible, wrong, and invisible without the
     *     reconciliation job §9.2 also asks for.
     *   - the UNIQUE INDEX. Two workers on a fresh period both find no row and
     *     both attempt a create; the constraint makes exactly one win and the
     *     loser fall into the update branch. Without it, `upsert` happily
     *     creates two rows and the counter reads half the truth.
     */
    async consume(input: {
      periodStart: Date;
      periodEnd: Date;
      metric: string;
      quantity: number;
    }): Promise<number> {
      const row = await db.usageRecord.upsert({
        where: {
          agencyId_periodStart_metric: {
            agencyId,
            periodStart: input.periodStart,
            metric: input.metric as never,
          },
        },
        create: {
          agencyId,
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
          metric: input.metric as never,
          quantity: input.quantity,
        },
        update: { quantity: { increment: input.quantity } },
      });
      return row.quantity;
    },

    /**
     * Gives back consumption that did not happen.
     *
     * ⚠️ FLOORED AT ZERO. §8.9 and §9.2 both say a FAILED action costs the
     * customer nothing, so a scan that errored or an AI call that was rejected
     * refunds its credit. Without the floor, a double refund (a retry that both
     * releases) drives the counter negative and hands the agency free quota that
     * survives into the next period's reconciliation as a discrepancy nobody
     * can explain.
     */
    async release(input: {
      periodStart: Date;
      metric: string;
      quantity: number;
    }): Promise<void> {
      await db.usageRecord.updateMany({
        where: {
          periodStart: input.periodStart,
          metric: input.metric as never,
          quantity: { gte: input.quantity },
        },
        data: { quantity: { decrement: input.quantity } },
      });
    },

    async upsertSubscription(input: {
      planId: string;
      stripeCustomerId: string;
      stripeSubscriptionId: string | null;
      status: string;
      interval: string;
      currentPeriodStart: Date | null;
      currentPeriodEnd: Date | null;
      trialEndsAt: Date | null;
      cancelAtPeriodEnd: boolean;
    }) {
      const data = {
        planId: input.planId,
        stripeCustomerId: input.stripeCustomerId,
        stripeSubscriptionId: input.stripeSubscriptionId,
        status: input.status as never,
        interval: input.interval as never,
        currentPeriodStart: input.currentPeriodStart,
        currentPeriodEnd: input.currentPeriodEnd,
        trialEndsAt: input.trialEndsAt,
        cancelAtPeriodEnd: input.cancelAtPeriodEnd,
      };
      return db.subscription.upsert({
        where: { agencyId },
        create: { agencyId, ...data },
        update: data,
      });
    },

    /** Admin-granted extras, layered over plan defaults by `@pdm/billing`. */
    async setOverrides(overrides: Prisma.InputJsonValue | null) {
      await db.subscription.updateMany({
        where: { agencyId },
        data: { entitlementOverrides: overrides ?? undefined },
      });
    },

    agencyId,
  };
}

export type BillingRepository = ReturnType<typeof billingRepository>;
