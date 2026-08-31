/**
 * TIMEZONE ARITHMETIC — PLAN.md Part VI §6.6, Part XI §11.11.
 *
 * Quiet hours and digests are both specified in the AGENCY's timezone, and both
 * are wrong in a way nobody notices until an alert lands at 3 a.m. for someone
 * in Sydney. Everything here converts between an instant (UTC `Date`) and a
 * wall-clock time in a named IANA zone.
 *
 * ⚠️ NO DEPENDENCY ON A DATE LIBRARY, deliberately. `Intl.DateTimeFormat`
 * carries the tz database the runtime already ships, which is the same database
 * a library would bundle a stale copy of. The only real work is the DST
 * correction in `zonedWallClockToInstant`, and it is 20 lines.
 */

/** Wall-clock fields as they read on a clock in `timeZone`. */
export interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  /** 0 = Sunday, matching `Date.prototype.getDay`. */
  weekday: number;
}

const WEEKDAYS: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/**
 * Formatters are expensive to build and are reused across every agency sharing
 * a zone — which, after grouping by zone, is most of them.
 */
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  const cached = formatters.get(timeZone);
  if (cached) return cached;
  const built = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
  });
  formatters.set(timeZone, built);
  return built;
}

/** True when the runtime's tz database knows the zone. */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** Reads the wall clock in `timeZone` at the given instant. */
export function toWallClock(instant: Date, timeZone: string): WallClock {
  const parts = formatterFor(timeZone).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? "0";

  // `hour: "2-digit"` with `hour12: false` yields "24" for midnight in some
  // ICU versions. Normalising it to 0 here keeps every comparison below honest.
  const hour = Number(get("hour")) % 24;

  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour,
    minute: Number(get("minute")),
    weekday: WEEKDAYS[get("weekday")] ?? 0,
  };
}

/** The zone's UTC offset in milliseconds at a given instant (DST-aware). */
export function offsetMs(instant: Date, timeZone: string): number {
  const wall = toWallClock(instant, timeZone);
  const seconds = Number(
    formatterFor(timeZone)
      .formatToParts(instant)
      .find((part) => part.type === "second")?.value ?? "0",
  );
  const asIfUtc = Date.UTC(
    wall.year,
    wall.month - 1,
    wall.day,
    wall.hour,
    wall.minute,
    seconds,
  );
  // Millisecond component is identical in both representations, so dropping it
  // from `asIfUtc` and adding it back cancels out.
  return asIfUtc - (instant.getTime() - instant.getMilliseconds());
}

/**
 * Converts a wall-clock time in `timeZone` to the UTC instant it names.
 *
 * ⚠️ THE TWO-PASS CORRECTION IS THE DST FIX AND IS NOT REDUNDANT. The offset
 * depends on the instant, and the instant is what we are solving for. Pass one
 * guesses with the offset at the naive instant; pass two re-reads the offset at
 * that guess. One pass is wrong for every wall-clock time within an offset's
 * distance of a transition — i.e. exactly the 08:00 digest on the Sunday the
 * clocks change.
 *
 * On a spring-forward gap (02:30 where 02:00 jumps to 03:00) the result lands
 * on the instant just after the gap, and on an autumn overlap it resolves to
 * the FIRST of the two — both are the conventional choices, and both are
 * strictly better than sending nothing that day.
 */
export function zonedWallClockToInstant(
  wall: { year: number; month: number; day: number; hour: number; minute: number },
  timeZone: string,
): Date {
  const naive = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute);
  const firstGuess = new Date(naive - offsetMs(new Date(naive), timeZone));
  return new Date(naive - offsetMs(firstGuess, timeZone));
}

/** Minutes since midnight on the zone's clock. */
export function minutesOfDay(instant: Date, timeZone: string): number {
  const wall = toWallClock(instant, timeZone);
  return wall.hour * 60 + wall.minute;
}

/** Parses `"HH:mm"`. Returns null on anything else — callers treat that as unset. */
export function parseHhMm(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}
