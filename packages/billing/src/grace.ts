import { isUnlimited } from "./entitlements";

/**
 * GRACE ON DOWNGRADE — PLAN.md Part IX §9.2, Phase 6 task 6.2.
 *
 * §9.2, verbatim: "If a downgrade puts an agency over a limit (e.g. 40 websites
 * on a 25-site plan), we do **not** delete anything. The agency enters a 14-day
 * grace period: existing sites keep being monitored, no new sites can be added,
 * and a banner asks them to archive down or upgrade. After grace, the
 * oldest-by-`createdAt` excess sites are auto-paused (never deleted), with an
 * email listing exactly which ones and how to restore them."
 *
 * ⚠️ EVERY FUNCTION HERE IS PURE. The state transition is decided from three
 * values — how many sites, what the limit is, when grace started — and executed
 * elsewhere. That split is what makes "we never delete anything" a property you
 * can test in a millisecond instead of a property you hope holds.
 *
 * ⚠️ PAUSE, NEVER DELETE, AND NEVER ARCHIVE EITHER. Pausing is reversible by the
 * customer in one click and keeps every scan, finding and piece of evidence
 * attached to the site. Archiving would free the plan slot — which sounds
 * helpful and would silently make the over-limit condition disappear along with
 * the customer's ability to see it.
 */

/** §9.2: "a 14-day grace period". */
export const GRACE_DAYS = 14;

export type GraceState =
  /** Within the limit. Nothing to do; any stored grace start is cleared. */
  | "clear"
  /** Over the limit, inside the window. Monitoring continues; adding is blocked. */
  | "grace"
  /** Over the limit, window elapsed. The excess sites are paused. */
  | "expired";

export interface GraceResolution {
  state: GraceState;
  /** How many sites are over. 0 when clear. */
  excess: number;
  /** When the window closes. Null when clear. */
  endsAt: Date | null;
  /** Whole days remaining, ceiling, floored at 0. Null when clear. */
  daysLeft: number | null;
}

export interface GraceInput {
  websiteCount: number;
  /** `-1` is unlimited. */
  maxWebsites: number;
  /** When the agency first went over, or null if it has not. */
  graceStartedAt: Date | null;
  now?: Date;
}

export function resolveGrace(input: GraceInput): GraceResolution {
  const now = input.now ?? new Date();

  if (isUnlimited(input.maxWebsites) || input.websiteCount <= input.maxWebsites) {
    /*
     * ⚠️ BACK UNDER THE LIMIT CLEARS THE CLOCK. An agency that archives two
     * sites on day 13 and adds one back on day 20 must get a fresh 14 days, not
     * the one day left on a stale timer. The caller nulls `graceStartedAt` when
     * it sees this state.
     */
    return { state: "clear", excess: 0, endsAt: null, daysLeft: null };
  }

  const excess = input.websiteCount - input.maxWebsites;

  if (!input.graceStartedAt) {
    // First sweep that sees the overage starts the clock. Nothing is paused on
    // the day of a downgrade — that is the whole point of a grace period.
    const endsAt = addDays(now, GRACE_DAYS);
    return { state: "grace", excess, endsAt, daysLeft: GRACE_DAYS };
  }

  const endsAt = addDays(input.graceStartedAt, GRACE_DAYS);
  if (now.getTime() >= endsAt.getTime()) {
    return { state: "expired", excess, endsAt, daysLeft: 0 };
  }

  return {
    state: "grace",
    excess,
    endsAt,
    /*
     * ⚠️ CEILING, matching the trial banner. A window closing in 30 hours has
     * "2 days left" to a customer; flooring would show "0 days left" for the
     * final 23 hours of a period in which nothing has happened yet.
     */
    daysLeft: Math.max(0, Math.ceil((endsAt.getTime() - now.getTime()) / 86_400_000)),
  };
}

/**
 * How many ACTIVE sites must be paused to bring an agency down to its limit.
 *
 * ⚠️ THIS IS NOT `GraceResolution.excess`, AND CONFLATING THE TWO PAUSES
 * EVERYTHING. `excess` counts every non-archived site against the limit, which
 * is right for the banner and for blocking new sites — a paused site still
 * occupies a plan slot, so an agency at 5-on-a-2-plan stays over the limit even
 * after three are paused, and must keep being told so.
 *
 * The number to PAUSE is a different question: how many of the still-active
 * ones are surplus. Using `excess` on the second night takes 5 sites, sees an
 * excess of 3 again, finds only 2 active candidates left, and pauses those too
 * — every site the agency owns, three nights running, one email each time.
 *
 * A DB-backed test found this; the pure arithmetic above was correct and said
 * nothing about it.
 */
export function countToPause(activeCount: number, maxWebsites: number): number {
  if (isUnlimited(maxWebsites)) return 0;
  return Math.max(0, activeCount - maxWebsites);
}

export interface PausableSite {
  id: string;
  createdAt: Date;
}

/**
 * §9.2: "the oldest-by-`createdAt` excess sites are auto-paused".
 *
 * ⚠️ OLDEST FIRST, WHICH LOOKS BACKWARDS AND IS WHAT §9.2 SAYS. The intuitive
 * choice is newest-first — "you added these after you downgraded, so they go".
 * §9.2 chose oldest, and the reason holds: the newest sites are the ones the
 * agency just onboarded and is actively working on, while the oldest are the
 * ones most likely to be a long-finished project nobody has archived. Either
 * rule is arbitrary for some customer; the important properties are that it is
 * DETERMINISTIC — the email can list exactly which sites before they are
 * touched — and that it is reversible.
 *
 * ⚠️ TIES BREAK ON `id`. Two sites created in the same millisecond (a CSV
 * import does this routinely) would otherwise pause in whatever order the
 * database returned them, so the email and the action could disagree.
 */
export function selectSitesToPause<T extends PausableSite>(
  sites: readonly T[],
  excess: number,
): T[] {
  if (excess <= 0) return [];
  return [...sites]
    .sort((a, b) => {
      const byAge = a.createdAt.getTime() - b.createdAt.getTime();
      return byAge !== 0 ? byAge : a.id.localeCompare(b.id);
    })
    .slice(0, excess);
}

function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * 86_400_000);
}
