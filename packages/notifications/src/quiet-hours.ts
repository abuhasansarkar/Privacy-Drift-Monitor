import {
  minutesOfDay,
  parseHhMm,
  toWallClock,
  zonedWallClockToInstant,
} from "./timezone";

/**
 * QUIET HOURS — PLAN.md Part VI §6.6.
 *
 * ⚠️ QUIET HOURS DEFER, THEY NEVER DROP. An alert suppressed at 02:00 and never
 * sent is a monitoring product that missed something; an alert delivered at
 * 07:00 is a product that respected someone's sleep. Every function here
 * returns a `deliverAt`, and `null` is only ever "send now" — never "discard".
 *
 * ⚠️ CRITICAL OVERRIDES BY DEFAULT (§6.6). A consent regression at 2 a.m. is
 * exactly what an agency wants woken up for; the per-rule opt-out exists so
 * they can decide otherwise, and it is opt-OUT rather than opt-in on purpose.
 */

export interface QuietHoursWindow {
  /** `"HH:mm"` in the agency timezone, or null when quiet hours are off. */
  start: string | null;
  end: string | null;
  timeZone: string;
}

export type QuietHoursDecision =
  | { deferred: false }
  | { deferred: true; deliverAt: Date };

/**
 * Is the instant inside the window?
 *
 * Handles the overnight case (22:00–07:00) by treating the window as a wrap
 * around midnight rather than an ordered pair — a naive `start <= now < end`
 * says 02:00 is outside 22:00–07:00, which is the single most common bug in
 * this feature.
 */
export function isWithinQuietHours(now: Date, window: QuietHoursWindow): boolean {
  const start = parseHhMm(window.start);
  const end = parseHhMm(window.end);
  if (start === null || end === null || start === end) return false;

  const minutes = minutesOfDay(now, window.timeZone);
  return start < end
    ? minutes >= start && minutes < end
    : minutes >= start || minutes < end;
}

/**
 * The instant quiet hours next end, expressed in UTC.
 *
 * Computed by building the wall-clock time of `end` on the correct calendar day
 * and converting through the tz database, so a DST transition inside the window
 * shifts the delivery time with the clocks rather than by a fixed number of
 * hours.
 */
export function quietHoursEndInstant(now: Date, window: QuietHoursWindow): Date | null {
  const start = parseHhMm(window.start);
  const end = parseHhMm(window.end);
  if (start === null || end === null || start === end) return null;

  const wall = toWallClock(now, window.timeZone);
  const minutes = wall.hour * 60 + wall.minute;

  // An overnight window entered before midnight ends TOMORROW; every other
  // case ends today, because `isWithinQuietHours` already placed us inside it.
  const endsTomorrow = start > end && minutes >= start;

  const target = zonedWallClockToInstant(
    {
      year: wall.year,
      month: wall.month,
      day: wall.day + (endsTomorrow ? 1 : 0),
      hour: Math.floor(end / 60),
      minute: end % 60,
    },
    window.timeZone,
  );

  // `Date.UTC` normalises a day overflow (32 March → 1 April), so no month or
  // year rollover handling is needed above.
  return target;
}

/**
 * The decision for one alert.
 *
 * `overrides` is the per-rule opt-out: `true` means this alert ignores quiet
 * hours entirely, which is what CRITICAL alerts get by default.
 */
export function applyQuietHours(
  now: Date,
  window: QuietHoursWindow,
  overrides: boolean,
): QuietHoursDecision {
  if (overrides) return { deferred: false };
  if (!isWithinQuietHours(now, window)) return { deferred: false };

  const deliverAt = quietHoursEndInstant(now, window);
  // Unreachable while `isWithinQuietHours` returned true — it needs both
  // bounds parsed — but returning "send now" beats returning "never" if the
  // two ever disagree.
  return deliverAt ? { deferred: true, deliverAt } : { deferred: false };
}
