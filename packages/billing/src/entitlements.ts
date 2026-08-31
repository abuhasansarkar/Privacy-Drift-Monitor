/**
 * ENTITLEMENTS — PLAN.md Part IX §9.2, Phase 6 task 6.2.
 *
 * **One service. No plan logic anywhere else.** (§9.2, first line.)
 *
 * ⚠️ THAT SENTENCE IS THE WHOLE DESIGN, AND THE REASON IS COMMERCIAL, NOT
 * AESTHETIC. Feature doc 17: "plan logic scattered across call sites becomes
 * nine different interpretations of 'what does Professional include', which is
 * a support and billing-dispute generator." A customer who was told they get 40
 * websites and is blocked at 39 by one call site that rounded differently is a
 * refund and a trust problem, and it is invisible until they complain.
 *
 * ⚠️ THIS FILE IS PURE. It takes a plan row and a subscription row and returns
 * a resolved set — no Prisma, no cache, no I/O. That is what lets the whole
 * resolution table below be tested exhaustively without a database, and it is
 * why `EntitlementService` (which does the I/O) is a thin shell over it.
 *
 * RESOLUTION ORDER (§9.2, verbatim):
 *
 *     plan defaults → subscription overrides (admin-granted) → status modifiers
 *
 * The order matters in both directions. Overrides sit ABOVE plan defaults
 * because they are how support grants a one-off exception. Status modifiers sit
 * ABOVE overrides because a `PAST_DUE` agency must stop consuming metered
 * resources even if support granted it extra — otherwise "grant more credits"
 * silently becomes "bill us for a customer who is not paying".
 */

import type { ScanFrequency, ScanPriority, ReportType } from "@pdm/schemas";

/** §9.2's dimension list, verbatim. `-1` means unlimited. */
export interface EntitlementSet {
  maxWebsites: number;
  maxTeamMembers: number;
  maxClients: number;
  scanFrequencies: ScanFrequency[];
  maxScansPerMonth: number;
  maxPagesPerScan: number;
  maxConcurrentScans: number;
  scanPriority: ScanPriority;
  aiCreditsPerMonth: number;
  aiAdvancedTier: boolean;
  whiteLabel: boolean;
  clientPortal: boolean;
  maxPortalUsers: number;
  reportTypes: ReportType[];
  maxReportsPerMonth: number;
  evidenceRetentionDays: number;
  scanHistoryRetentionDays: number;
  slackIntegration: boolean;
  webhooks: boolean;
  apiAccess: boolean;
  prioritySupport: boolean;
}

/**
 * ⚠️ `-1` IS UNLIMITED, `0` IS NONE, AND THEY ARE NOT INTERCHANGEABLE.
 * §9.2 fixes `-1` for the Scale plan's unlimited team members and clients. Every
 * comparison in this file goes through `isUnlimited` rather than testing a raw
 * number, because `used >= limit` with `limit === -1` is TRUE — i.e. an
 * unlimited plan would block on its first website. That is the single easiest
 * catastrophic bug in this file.
 */
export const UNLIMITED = -1;

export function isUnlimited(limit: number): boolean {
  return limit === UNLIMITED;
}

/** Mirrors the Prisma `SubscriptionStatus` enum. */
export type SubscriptionStatusName =
  | "TRIALING"
  | "ACTIVE"
  | "PAST_DUE"
  | "CANCELED"
  | "UNPAID"
  | "INCOMPLETE"
  | "INCOMPLETE_EXPIRED"
  | "PAUSED";

/**
 * Statuses that put an agency into READ-ONLY (§9.2 status modifiers, and rule 3
 * of feature doc 17's "four rules that prevent billing disasters").
 *
 * ⚠️ READ-ONLY MEANS "STOP SPENDING", NEVER "HIDE THEIR DATA". Rule 3 is
 * explicit: "Payment failure degrades to read-only scanning without hiding
 * data. The agency keeps access to everything it has; it just stops generating
 * new scans. Hiding data on non-payment is hostile and a support disaster."
 *
 * So the modifier below zeroes exactly two things — the two metered resources
 * that cost us money per use — and touches nothing that governs VIEWING. An
 * agency in arrears can still read every scan, every finding, every report and
 * every piece of evidence it has already paid for.
 */
const READ_ONLY_STATUSES: ReadonlySet<SubscriptionStatusName> = new Set([
  "PAST_DUE",
  "UNPAID",
  "CANCELED",
  "INCOMPLETE_EXPIRED",
  "PAUSED",
]);

export function isReadOnly(status: SubscriptionStatusName): boolean {
  return READ_ONLY_STATUSES.has(status);
}

/**
 * The entitlements an agency with NO subscription row gets.
 *
 * ⚠️ NOT ZERO, AND NOT UNLIMITED. An agency with no subscription is one that
 * signed up seconds ago and whose Stripe customer has not been created yet, or
 * one seeded locally. Zeroing it would make the product unusable in the first
 * minute of every trial — which is the minute that decides activation. Giving
 * it unlimited would make "delete your subscription row" a free upgrade.
 *
 * The Starter shape is the honest answer: the smallest paid plan, with metered
 * resources present but small. `resolveEntitlements` is given the real Starter
 * row when one exists; this constant is the last-resort fallback for when even
 * that lookup fails, so the product degrades to "small" and never to "broken".
 */
export const FALLBACK_ENTITLEMENTS: EntitlementSet = {
  maxWebsites: 10,
  maxTeamMembers: 2,
  maxClients: 10,
  scanFrequencies: ["WEEKLY", "MONTHLY", "MANUAL"],
  maxScansPerMonth: 60,
  maxPagesPerScan: 1,
  maxConcurrentScans: 1,
  scanPriority: "NORMAL",
  aiCreditsPerMonth: 50,
  aiAdvancedTier: false,
  whiteLabel: false,
  clientPortal: false,
  maxPortalUsers: 0,
  reportTypes: ["SCAN", "WEBSITE_HEALTH"],
  maxReportsPerMonth: 10,
  evidenceRetentionDays: 30,
  scanHistoryRetentionDays: 365,
  slackIntegration: false,
  webhooks: false,
  apiAccess: false,
  prioritySupport: false,
};

export interface ResolveInput {
  /** `Plan.entitlements`, the JSON column. Unvalidated by construction. */
  planEntitlements: unknown;
  /** `Subscription.entitlementOverrides`, admin-granted. */
  overrides?: unknown;
  /** `Subscription.status`. Absent when the agency has no subscription. */
  status?: SubscriptionStatusName;
  /** `Subscription.trialEndsAt` — an expired trial is read-only (§9.2). */
  trialEndsAt?: Date | null;
  now?: Date;
}

/**
 * Resolves the three layers into one set.
 *
 * ⚠️ EVERY FIELD IS READ INDIVIDUALLY AND TYPE-CHECKED, never spread. Both
 * inputs are `Json` columns — `planEntitlements` is written by a seed script and
 * `overrides` by an admin surface, so neither is guaranteed to match
 * `EntitlementSet`. A spread would let a malformed row (a string where a number
 * belongs, a missing key) propagate into a limit comparison, where
 * `used >= "40"` and `used >= undefined` both silently do the wrong thing.
 * Reading field by field means a bad row degrades one dimension to its fallback
 * instead of corrupting the whole set.
 */
export function resolveEntitlements(input: ResolveInput): EntitlementSet {
  const plan = pick(input.planEntitlements);
  const over = pick(input.overrides);
  const now = input.now ?? new Date();

  const layer = <K extends keyof EntitlementSet>(
    key: K,
    read: (value: unknown) => EntitlementSet[K] | undefined,
  ): EntitlementSet[K] =>
    read(over[key as string]) ?? read(plan[key as string]) ?? FALLBACK_ENTITLEMENTS[key];

  const resolved: EntitlementSet = {
    maxWebsites: layer("maxWebsites", num),
    maxTeamMembers: layer("maxTeamMembers", num),
    maxClients: layer("maxClients", num),
    scanFrequencies: layer("scanFrequencies", (v) => strArray<ScanFrequency>(v)),
    maxScansPerMonth: layer("maxScansPerMonth", num),
    maxPagesPerScan: layer("maxPagesPerScan", num),
    maxConcurrentScans: layer("maxConcurrentScans", num),
    scanPriority: layer("scanPriority", (v) => str<ScanPriority>(v)),
    aiCreditsPerMonth: layer("aiCreditsPerMonth", num),
    aiAdvancedTier: layer("aiAdvancedTier", bool),
    whiteLabel: layer("whiteLabel", bool),
    clientPortal: layer("clientPortal", bool),
    maxPortalUsers: layer("maxPortalUsers", num),
    reportTypes: layer("reportTypes", (v) => strArray<ReportType>(v)),
    maxReportsPerMonth: layer("maxReportsPerMonth", num),
    evidenceRetentionDays: layer("evidenceRetentionDays", num),
    scanHistoryRetentionDays: layer("scanHistoryRetentionDays", num),
    slackIntegration: layer("slackIntegration", bool),
    webhooks: layer("webhooks", bool),
    apiAccess: layer("apiAccess", bool),
    prioritySupport: layer("prioritySupport", bool),
  };

  return applyStatusModifier(resolved, input.status, input.trialEndsAt, now);
}

/**
 * The third layer: status modifiers (§9.2).
 *
 * ⚠️ APPLIED LAST, SO IT WINS OVER AN ADMIN OVERRIDE. Support granting extra AI
 * credits must not keep a non-paying agency spending our provider budget. The
 * grant is still stored and comes back the moment the account is current again.
 */
function applyStatusModifier(
  set: EntitlementSet,
  status: SubscriptionStatusName | undefined,
  trialEndsAt: Date | null | undefined,
  now: Date,
): EntitlementSet {
  const trialExpired =
    status === "TRIALING" && trialEndsAt != null && trialEndsAt.getTime() <= now.getTime();

  if (!status || (!isReadOnly(status) && !trialExpired)) return set;

  /*
   * ⚠️ EXACTLY TWO FIELDS ARE ZEROED. Everything else — maxWebsites,
   * clientPortal, reportTypes, retention — is left alone on purpose: those
   * govern what the agency can SEE and keep, and §9.2 says customers "never
   * lose access to their historical data over a billing problem".
   *
   * In particular `evidenceRetentionDays` must NOT be reduced here. The
   * retention sweep reads it, so lowering it on non-payment would DELETE a
   * paying-yesterday customer's evidence — irreversibly, over an expired card.
   */
  return { ...set, maxScansPerMonth: 0, aiCreditsPerMonth: 0 };
}

/* ── Readers. Each returns `undefined` for anything it cannot vouch for. ── */

function pick(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function num(value: unknown): number | undefined {
  // `Number.isFinite` rejects NaN and Infinity; a limit of Infinity would pass
  // every check while looking like a deliberate "unlimited" that is not `-1`.
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function bool(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function str<T extends string>(value: unknown): T | undefined {
  return typeof value === "string" && value.length > 0 ? (value as T) : undefined;
}

function strArray<T extends string>(value: unknown): T[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.filter((v): v is string => typeof v === "string");
  // An array that lost every member to the filter is a malformed row, not an
  // empty entitlement — fall through to the next layer rather than granting
  // "no report types at all".
  return items.length > 0 ? (items as T[]) : undefined;
}

/* ── Limit arithmetic ─────────────────────────────────────────────────── */

export interface LimitCheck {
  allowed: boolean;
  /** `null` when unlimited — callers must render this as unlimited, not 0. */
  limit: number | null;
  used: number;
  remaining: number | null;
  /** True at or above §9.2's notify threshold, for the "nearing limit" banner. */
  nearingLimit: boolean;
}

/** §8.9 uses the same 80% threshold for AI credits; §9.2 for usage meters. */
export const NEARING_LIMIT_THRESHOLD = 0.8;

/**
 * Would consuming `quantity` more stay inside `limit`?
 *
 * ⚠️ `used + quantity > limit`, NOT `used >= limit`. A report costing 1 and an
 * advanced AI call costing 3 credits are both "one action", and an agency with
 * 2 credits left must be blocked from the 3-credit call rather than allowed to
 * finish 1 over. A cap that can be exceeded by the price of one action is not a
 * cap — the same reasoning `packages/ai`'s `checkBudget` already applies.
 */
export function checkLimit(
  used: number,
  limit: number,
  quantity = 1,
): LimitCheck {
  if (isUnlimited(limit)) {
    return { allowed: true, limit: null, used, remaining: null, nearingLimit: false };
  }
  const remaining = Math.max(0, limit - used);
  return {
    allowed: used + quantity <= limit,
    limit,
    used,
    remaining,
    // A limit of 0 is "none allowed", which is not "80% of the way to none".
    nearingLimit: limit > 0 && used / limit >= NEARING_LIMIT_THRESHOLD,
  };
}
