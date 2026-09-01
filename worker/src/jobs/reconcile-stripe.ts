import { unsafeGlobalClient } from "@pdm/database";
import {
  createStripeClient,
  fromUnix,
  mapStripeInterval,
  mapStripeStatus,
} from "@pdm/billing";
import { logger } from "@pdm/shared/logger";

/**
 * DAILY STRIPE RECONCILIATION — PLAN.md Part IX §9.1, Phase 6 task 6.1.
 *
 * §9.1: "A daily `maintenance` job fetches all active Stripe subscriptions and
 * compares them to our table, logging and correcting any divergence. **This
 * catches missed webhooks — the one failure mode that silently corrupts billing
 * state.**"
 *
 * ⚠️ THAT LAST CLAUSE IS THE WHOLE JUSTIFICATION. Every other billing failure
 * announces itself: a declined card emails the customer, a Stripe outage shows
 * a banner, a bad price fails at checkout. A LOST WEBHOOK announces nothing. An
 * agency that upgraded stays on the old plan and quietly hits limits they have
 * paid to clear; an agency that cancelled keeps full service indefinitely. Both
 * look completely normal from inside the product, and neither is discoverable
 * without asking Stripe.
 *
 * ⚠️ STRIPE WINS EVERY DISAGREEMENT. §9.1's first line makes Stripe the source
 * of truth and our table a projection, so "correcting divergence" only ever
 * means writing Stripe's answer into our row. This job never calls back the
 * other way — it does not cancel a Stripe subscription because our row says
 * CANCELED. Repairing the projection is safe; mutating the source of truth from
 * a projection is how a reconciliation job cancels a paying customer.
 */

const db = unsafeGlobalClient(
  // Justification (required in review): reconciliation compares OUR whole
  // subscription table against Stripe's. It is a platform sweep by definition —
  // a tenant-scoped client could only check the one agency it was handed, and
  // the divergence being hunted is precisely the one nobody knows to look for.
  "Stripe reconciliation sweeps every agency's subscription by definition",
);

export interface SubscriptionDivergence {
  agencyId: string;
  stripeSubscriptionId: string;
  field: "status" | "interval" | "currentPeriodEnd" | "cancelAtPeriodEnd" | "planId";
  ours: string | null;
  stripes: string | null;
}

export interface StripeReconcileResult {
  checked: number;
  divergences: SubscriptionDivergence[];
  repaired: number;
  /** True when Stripe was unreachable — the result means nothing, not "clean". */
  skipped: boolean;
}

export async function reconcileStripe(
  options: { dryRun?: boolean } = {},
): Promise<StripeReconcileResult> {
  const result: StripeReconcileResult = {
    checked: 0,
    divergences: [],
    repaired: 0,
    skipped: false,
  };

  const stripe = createStripeClient();
  if (!stripe) {
    /*
     * ⚠️ `skipped: true`, NOT an empty clean result. A caller that reads
     * `divergences.length === 0` as "billing is consistent" would be told
     * everything is fine by a job that never ran — which is the reassurance
     * this job exists to make impossible.
     */
    logger.warn(
      { component: "reconcile-stripe" },
      "STRIPE_SECRET_KEY is unset — reconciliation skipped, NOT clean",
    );
    return { ...result, skipped: true };
  }

  const ours = await db.subscription.findMany({
    where: { stripeSubscriptionId: { not: null } },
    select: {
      id: true,
      agencyId: true,
      stripeSubscriptionId: true,
      status: true,
      interval: true,
      currentPeriodEnd: true,
      cancelAtPeriodEnd: true,
      planId: true,
    },
  });

  for (const row of ours) {
    result.checked += 1;

    let remote;
    try {
      remote = await stripe.subscriptions.retrieve(row.stripeSubscriptionId!);
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404) {
        /*
         * ⚠️ A 404 MEANS THE SUBSCRIPTION IS GONE FROM STRIPE, which is a real
         * divergence and usually a missed `customer.subscription.deleted`. It
         * is recorded and repaired to CANCELED — read-only, never a deletion,
         * so the agency keeps every scan and report it has (rule 3).
         */
        result.divergences.push({
          agencyId: row.agencyId,
          stripeSubscriptionId: row.stripeSubscriptionId!,
          field: "status",
          ours: row.status,
          stripes: "missing-in-stripe",
        });
        if (!options.dryRun && row.status !== "CANCELED") {
          await db.subscription.update({
            where: { id: row.id },
            data: { status: "CANCELED" },
          });
          result.repaired += 1;
        }
        continue;
      }
      // Anything else is a transport problem, not a divergence. Skipping one
      // row is better than declaring a false divergence on a network blip.
      logger.warn(
        { component: "reconcile-stripe", agencyId: row.agencyId, err: error },
        "could not retrieve subscription from Stripe",
      );
      continue;
    }

    const item = remote.items?.data?.[0];
    const remoteStatus = mapStripeStatus(remote.status);
    const remoteInterval = mapStripeInterval(item?.price?.recurring?.interval);
    const remotePeriodEnd = fromUnix(
      (item as unknown as { current_period_end?: number })?.current_period_end ??
        (remote as unknown as { current_period_end?: number }).current_period_end,
    );
    const remoteCancel = remote.cancel_at_period_end === true;

    const plan = item?.price?.id
      ? await db.plan.findFirst({
          where: {
            OR: [
              { stripePriceMonthlyId: item.price.id },
              { stripePriceAnnualId: item.price.id },
            ],
          },
          select: { id: true },
        })
      : null;

    const diffs: SubscriptionDivergence[] = [];
    const push = (field: SubscriptionDivergence["field"], a: unknown, b: unknown) => {
      diffs.push({
        agencyId: row.agencyId,
        stripeSubscriptionId: row.stripeSubscriptionId!,
        field,
        ours: a == null ? null : String(a),
        stripes: b == null ? null : String(b),
      });
    };

    if (row.status !== remoteStatus) push("status", row.status, remoteStatus);
    if (row.interval !== remoteInterval) push("interval", row.interval, remoteInterval);
    if (row.cancelAtPeriodEnd !== remoteCancel) {
      push("cancelAtPeriodEnd", row.cancelAtPeriodEnd, remoteCancel);
    }
    if (plan && plan.id !== row.planId) push("planId", row.planId, plan.id);
    /*
     * ⚠️ PERIOD END IS COMPARED TO THE SECOND, NOT THE MILLISECOND. Stripe
     * stores UNIX seconds; a round-trip through Postgres can differ by
     * sub-second precision, and comparing exactly would report a divergence on
     * every single row forever — which trains everyone to ignore this job's
     * output, defeating it entirely.
     */
    if (
      remotePeriodEnd &&
      Math.floor((row.currentPeriodEnd?.getTime() ?? 0) / 1000) !==
        Math.floor(remotePeriodEnd.getTime() / 1000)
    ) {
      push("currentPeriodEnd", row.currentPeriodEnd?.toISOString(), remotePeriodEnd.toISOString());
    }

    if (diffs.length === 0) continue;
    result.divergences.push(...diffs);

    if (!options.dryRun) {
      await db.subscription.update({
        where: { id: row.id },
        data: {
          status: remoteStatus as never,
          interval: remoteInterval as never,
          cancelAtPeriodEnd: remoteCancel,
          ...(remotePeriodEnd ? { currentPeriodEnd: remotePeriodEnd } : {}),
          ...(plan ? { planId: plan.id } : {}),
        },
      });
      result.repaired += 1;
    }
  }

  /*
   * ⚠️ `error`, NOT `info`, ON ANY DIVERGENCE — the same rule the counter
   * reconciliation follows. A webhook that was lost once will be lost again;
   * the repair below hides the symptom, and this line is what points at the
   * cause. A silent nightly correction is a billing bug that never gets fixed.
   */
  if (result.divergences.length > 0) {
    logger.error(
      {
        component: "reconcile-stripe",
        divergences: result.divergences.length,
        repaired: result.repaired,
        sample: result.divergences.slice(0, 10),
      },
      "billing divergence from Stripe — a webhook was probably missed",
    );
  } else {
    logger.info(
      { component: "reconcile-stripe", checked: result.checked },
      "subscriptions match Stripe",
    );
  }

  return result;
}
