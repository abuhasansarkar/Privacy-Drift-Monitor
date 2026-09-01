import "server-only";
import { unsafeGlobalClient } from "@pdm/database";
import { repositoriesFor } from "@pdm/database/repositories";
import {
  isUnlimited,
  resolveGrace,
  type EntitlementSet,
  type GraceResolution,
  type UsageSummary,
} from "@pdm/billing";
import type { AgencyContext } from "@/server/auth/context";
import { getBillingState, getEntitlements, getUsageSummary } from "@/server/entitlements";
import { getStripeSideData, type StripeSideData } from "@/server/services/billing";

/**
 * BILLING PAGE DATA — PLAN.md Part III §3.11 (`/app/billing`), Phase 6 task 6.3.
 *
 * ⚠️ ONE QUERY MODULE, NOT SIX AWAITS IN THE PAGE. The page renders five
 * independent surfaces (plan card, meters, invoices, banners, plan picker) that
 * all read the same subscription. Fetching per component would issue the same
 * subscription query five times and — worse — could render a plan card for one
 * plan beside meters resolved against another if a webhook landed mid-render.
 *
 * ⚠️ NOTHING HERE WRITES. §9.1: the webhook is the only writer of subscription
 * state. A page that "fixed up" a stale projection on read would be inferring
 * billing state from a page view.
 */

const db = unsafeGlobalClient(
  // Justification (required in review): `Plan` is a GLOBAL catalogue — the same
  // four public plans for every agency. Nothing tenant-scoped is read here; the
  // subscription comes from `repositoriesFor(agencyId)` below.
  "Plan is a global catalogue read for the plan picker; no tenant data is read through this client",
);

export interface PlanOption {
  key: string;
  name: string;
  description: string | null;
  priceMonthlyCents: number;
  priceAnnualCents: number;
  currency: string;
  entitlements: EntitlementSet;
  current: boolean;
}

export interface BillingPageData {
  planName: string | null;
  planKey: string | null;
  status: string | null;
  interval: "MONTHLY" | "ANNUAL";
  priceCents: number | null;
  currency: string;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  trialEndsAt: Date | null;
  /** Whole days left, floored at 0. Null when not trialing. */
  trialDaysLeft: number | null;
  readOnly: boolean;
  entitlements: EntitlementSet;
  usage: UsageSummary[];
  plans: PlanOption[];
  stripe: StripeSideData;
  /**
   * §9.2's grace state: the agency is over a limit it used to be under, which
   * happens after a downgrade. Nothing is deleted — this drives a banner that
   * asks them to archive or move back up.
   */
  overLimit: UsageSummary[];
  /**
   * §9.2's 14-day window, resolved from the same pure function the nightly
   * sweep uses.
   *
   * ⚠️ THE PAGE AND THE SWEEP MUST NOT DISAGREE. A banner that counts down
   * differently from the job that acts is how a customer is told they have
   * three days left on the morning their sites are paused — so both call
   * `resolveGrace`, and neither reimplements the arithmetic.
   */
  grace: GraceResolution;
}

export async function getBillingPageData(ctx: AgencyContext): Promise<BillingPageData> {
  const repos = repositoriesFor(ctx.agencyId);

  const [subscription, entitlements, usage, billingState, plans, stripe] =
    await Promise.all([
      repos.billing.subscription(),
      getEntitlements(ctx.agencyId),
      getUsageSummary(ctx.agencyId),
      getBillingState(ctx.agencyId),
      db.plan.findMany({ where: { isPublic: true }, orderBy: { sortOrder: "asc" } }),
      getStripeSideData(ctx),
    ]);

  const interval = (subscription?.interval ?? "MONTHLY") as "MONTHLY" | "ANNUAL";
  const planRow = subscription?.plan ?? null;

  const websiteUsage = usage.find((row) => row.metric === "WEBSITES");
  const grace = resolveGrace({
    websiteCount: websiteUsage?.used ?? 0,
    maxWebsites: entitlements.maxWebsites,
    graceStartedAt: subscription?.graceStartedAt ?? null,
  });

  return {
    planName: planRow?.name ?? null,
    planKey: planRow?.key ?? null,
    status: subscription?.status ?? null,
    interval,
    priceCents: planRow
      ? interval === "ANNUAL"
        ? planRow.priceAnnualCents
        : planRow.priceMonthlyCents
      : null,
    currency: planRow?.currency ?? "usd",
    currentPeriodEnd: subscription?.currentPeriodEnd ?? null,
    cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd ?? false,
    trialEndsAt: billingState.trialEndsAt,
    trialDaysLeft: trialDaysLeft(billingState.status, billingState.trialEndsAt),
    readOnly: billingState.readOnly,
    entitlements,
    usage,
    plans: plans.map((plan) => ({
      key: plan.key,
      name: plan.name,
      description: plan.description,
      priceMonthlyCents: plan.priceMonthlyCents,
      priceAnnualCents: plan.priceAnnualCents,
      currency: plan.currency,
      entitlements: plan.entitlements as unknown as EntitlementSet,
      current: plan.key === planRow?.key,
    })),
    stripe,
    /*
     * ⚠️ `remaining < 0`, NOT `!allowed`. A meter sitting exactly ON its limit
     * is a normal full-usage state, not a downgrade casualty — banner-ing it
     * would tell every agency that finished its scan allowance that it is "over
     * its new plan limit", which is both false and alarming.
     */
    grace,
    overLimit: usage.filter(
      (row) => row.limit !== null && !isUnlimited(row.limit) && row.used > row.limit,
    ),
  };
}

/**
 * §3.11's "Trial banner with days remaining".
 *
 * ⚠️ CEILING, NOT FLOOR. A trial ending in 30 hours has "2 days left" to a
 * customer and 1.25 to `Math.floor`. Rounding down means the banner reads "1
 * day left" for a day and a half, and the last 23 hours read "0 days left" while
 * the trial is still running — which is the shape of a support ticket.
 */
function trialDaysLeft(status: string | null, trialEndsAt: Date | null): number | null {
  if (status !== "TRIALING" || !trialEndsAt) return null;
  const ms = trialEndsAt.getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}
