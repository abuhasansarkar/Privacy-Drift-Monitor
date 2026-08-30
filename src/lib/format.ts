/**
 * FORMATTING — PLAN.md §11.9.
 *
 * Every number and date goes through `Intl` with an EXPLICIT locale. Relying on
 * the runtime default makes output differ between a developer's laptop, the
 * server and the user's browser, and hydration mismatches follow.
 *
 * Timestamps are stored UTC and displayed in the user's timezone (else the
 * agency's), so every date helper takes one — there is no "local time" default.
 */

const LOCALE = "en-GB";

const numberFormat = new Intl.NumberFormat(LOCALE);

export function formatNumber(value: number): string {
  return numberFormat.format(value);
}

/** e.g. "29 Aug 2026, 03:12". */
export function formatDateTime(value: Date, timeZone: string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(value);
}

/** e.g. "29 Aug 2026". */
export function formatDate(value: Date, timeZone: string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    dateStyle: "medium",
    timeZone,
  }).format(value);
}

const relativeFormat = new Intl.RelativeTimeFormat(LOCALE, { numeric: "auto" });

const DIVISIONS: Array<{ amount: number; unit: Intl.RelativeTimeFormatUnit }> = [
  { amount: 60, unit: "second" },
  { amount: 60, unit: "minute" },
  { amount: 24, unit: "hour" },
  { amount: 7, unit: "day" },
  { amount: 4.34524, unit: "week" },
  { amount: 12, unit: "month" },
  { amount: Number.POSITIVE_INFINITY, unit: "year" },
];

/**
 * "2 hours ago". Takes `now` explicitly so a Server Component renders the same
 * string the test asserts — an implicit `Date.now()` here is untestable and
 * produces a hydration mismatch the moment the client re-renders.
 */
export function formatRelative(value: Date, now: Date): string {
  let duration = (value.getTime() - now.getTime()) / 1000;
  for (const division of DIVISIONS) {
    if (Math.abs(duration) < division.amount) {
      return relativeFormat.format(Math.round(duration), division.unit);
    }
    duration /= division.amount;
  }
  return relativeFormat.format(Math.round(duration), "year");
}

/** Seconds → "2 m 41 s" for scan durations. */
export function formatDuration(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  return minutes > 0 ? `${minutes} m ${rest} s` : `${rest} s`;
}
