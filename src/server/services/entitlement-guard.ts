import "server-only";
import { EntitlementExceededError } from "@pdm/shared/errors";
import { t } from "@pdm/shared/copy";
import { track } from "@pdm/shared/analytics";
import type { EntitlementSet } from "@pdm/billing";
import type { UsageMetric } from "@pdm/schemas";
import {
  checkMetricLimit,
  consumeMetric,
  getEntitlements,
} from "@/server/entitlements";

/**
 * ENTITLEMENT GUARDS — PLAN.md Part IX §9.2, Phase 6 task 6.2.
 *
 * The nine enforcement points of §9.2 call these. **None of them reimplements a
 * limit**, which is the whole point of "one service, no plan logic anywhere
 * else": a guard here reads the resolved set and throws, and the plan rule it
 * enforces lives in exactly one place.
 *
 * ⚠️ THESE THROW `EntitlementExceededError` (402), WHICH IS NOT AN ERROR
 * CONDITION — it is a SALES SURFACE. §9.2 wants "402 + upgrade prompt naming
 * the limit", so every message here says which limit was reached and what the
 * number is. "Something went wrong" on a plan ceiling is a support ticket; "You
 * have used 40 of 40 websites" is a upgrade click.
 *
 * ⚠️ THE `reason` IS LOG-ONLY. `expose: true` on this error class means the
 * message reaches the browser, so the message carries the customer-facing
 * number and the `reason` carries the internals (§10.x, and the reviewer rule
 * in `00-development-workflow.md` about internal identifiers).
 */

/** A limit that is checked but not consumed — websites, seats, reports. */
export async function requireCapacity(
  agencyId: string,
  metric: UsageMetric,
  quantity = 1,
): Promise<void> {
  const check = await checkMetricLimit(agencyId, metric, quantity);
  if (check.allowed) return;

  /*
   * ⚠️ §9.6's `entitlement_limit_hit`, EMITTED FROM THE GUARD RATHER THAN FROM
   * NINE CALL SITES. This is the single most commercially important event in
   * the product — it is the moment a customer wanted something their plan does
   * not include — and putting it at the call sites would mean nine chances to
   * forget it and nine subtly different property shapes.
   *
   * `void`, never awaited: a 402 is already a slow path for the user, and
   * telemetry must not make it slower.
   */
  void track("entitlement_limit_hit", { metric, used: check.used, limit: check.limit }, { agencyId });

  throw new EntitlementExceededError(limitMessage(metric, check.used, check.limit), {
    reason: `LIMIT:${metric}:used=${check.used}:limit=${check.limit}:agency=${agencyId}`,
  });
}

/**
 * A metered resource that is checked AND recorded — scans, AI credits, reports.
 *
 * ⚠️ IT RECORDS ONLY WHEN IT ALLOWS. A caller that catches the throw has spent
 * nothing, so a rejected action never appears on the customer's invoice — which
 * is the same rule §8.9 already applies to a failed AI call ("we do not charge
 * the customer for our failure").
 */
export async function requireAndConsume(
  agencyId: string,
  metric: UsageMetric,
  quantity = 1,
): Promise<void> {
  const { allowed, check } = await consumeMetric(agencyId, metric, quantity);
  if (allowed) return;

  void track("entitlement_limit_hit", { metric, used: check.used, limit: check.limit }, { agencyId });

  throw new EntitlementExceededError(limitMessage(metric, check.used, check.limit), {
    reason: `QUOTA:${metric}:used=${check.used}:limit=${check.limit}:agency=${agencyId}`,
  });
}

/**
 * A boolean feature — white-label, client portal, API access.
 *
 * ⚠️ SEPARATE FROM `requireCapacity` BECAUSE THE MESSAGE IS DIFFERENT IN KIND.
 * "You have used all 40 websites" invites an upgrade to get more; "White-label
 * reports are not on your plan" invites an upgrade to get the feature at all.
 * Collapsing them produces "You have used 0 of 0 white-label", which is
 * nonsense to a reader.
 */
export async function requireFeature(
  agencyId: string,
  feature: keyof EntitlementSet,
): Promise<void> {
  const entitlements = await getEntitlements(agencyId);
  if (entitlements[feature] === true) return;

  throw new EntitlementExceededError(t("billing.featureNotOnPlan"), {
    reason: `FEATURE:${String(feature)}:agency=${agencyId}`,
  });
}

/**
 * A value that must be a member of a plan's allowed list — scan frequency,
 * report type.
 *
 * ⚠️ §9.2 GIVES THESE A SOFTER FAILURE THAN A LIMIT: "Option disabled with a
 * plan tooltip", "type unavailable". The UI is expected to hide the option, so
 * reaching this guard means either a stale form or a crafted request — both of
 * which deserve the 402 rather than a silent downgrade to an allowed value.
 * Silently substituting would generate a report the user did not ask for.
 */
export async function requireAllowedValue<K extends keyof EntitlementSet>(
  agencyId: string,
  key: K,
  value: string,
): Promise<void> {
  const entitlements = await getEntitlements(agencyId);
  const allowed = entitlements[key];
  if (Array.isArray(allowed) && (allowed as string[]).includes(value)) return;

  throw new EntitlementExceededError(t("billing.optionNotOnPlan"), {
    reason: `OPTION:${String(key)}=${value}:agency=${agencyId}`,
  });
}

/**
 * The customer-facing sentence. Names the limit and the number (§9.2).
 *
 * ⚠️ IT NEVER SAYS "unlimited" HERE, because this function is only reached on a
 * REFUSAL — and an unlimited limit cannot refuse. A `null` limit arriving here
 * means `checkLimit` disallowed something with no ceiling, which is a bug in
 * the caller, so the copy falls back to the generic sentence rather than
 * rendering "0 of null".
 */
function limitMessage(metric: UsageMetric, used: number, limit: number | null): string {
  if (limit === null) return t("billing.limitReached");

  const noun = METRIC_NOUN[metric];
  return `${t("billing.limitReached")} ${used}/${limit} ${noun}.`;
}

/** Plain-language nouns for the 402 message. */
const METRIC_NOUN: Record<UsageMetric, string> = {
  WEBSITES: "websites",
  SEATS: "team members",
  SCANS: "scans this period",
  AI_CREDITS: "AI credits this period",
  REPORTS: "reports this period",
  STORAGE_BYTES: "stored bytes",
};
