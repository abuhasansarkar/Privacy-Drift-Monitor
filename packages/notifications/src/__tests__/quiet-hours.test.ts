import { describe, expect, it } from "vitest";
import {
  applyQuietHours,
  isWithinQuietHours,
  quietHoursEndInstant,
} from "../quiet-hours";
import { minutesOfDay, zonedWallClockToInstant } from "../timezone";

/**
 * QUIET HOURS — feature doc 13 names DST as the trap: "DST transitions break
 * naive quiet-hours math. Test the boundaries explicitly."
 *
 * Every assertion below is an instant in UTC compared against a wall-clock
 * expectation in a named zone, because that is the only comparison that can
 * catch a fixed-offset bug.
 */

const LONDON = { start: "22:00", end: "07:00", timeZone: "Europe/London" };

describe("isWithinQuietHours", () => {
  it("treats an overnight window as a wrap around midnight", () => {
    // 02:00 London on a winter night — inside 22:00–07:00.
    const night = new Date("2026-01-15T02:00:00Z");
    expect(isWithinQuietHours(night, LONDON)).toBe(true);
  });

  it("is exclusive at the end boundary and inclusive at the start", () => {
    // 22:00 exactly: inside. 07:00 exactly: outside — the window has ended.
    const at22 = zonedWallClockToInstant(
      { year: 2026, month: 1, day: 15, hour: 22, minute: 0 },
      "Europe/London",
    );
    const at07 = zonedWallClockToInstant(
      { year: 2026, month: 1, day: 16, hour: 7, minute: 0 },
      "Europe/London",
    );
    expect(isWithinQuietHours(at22, LONDON)).toBe(true);
    expect(isWithinQuietHours(at07, LONDON)).toBe(false);
  });

  it("handles a same-day window", () => {
    const window = { start: "09:00", end: "17:00", timeZone: "Europe/London" };
    const noon = zonedWallClockToInstant(
      { year: 2026, month: 1, day: 15, hour: 12, minute: 0 },
      "Europe/London",
    );
    const evening = zonedWallClockToInstant(
      { year: 2026, month: 1, day: 15, hour: 20, minute: 0 },
      "Europe/London",
    );
    expect(isWithinQuietHours(noon, window)).toBe(true);
    expect(isWithinQuietHours(evening, window)).toBe(false);
  });

  it("is off when either bound is unset or the two are equal", () => {
    const now = new Date("2026-01-15T02:00:00Z");
    expect(isWithinQuietHours(now, { ...LONDON, start: null })).toBe(false);
    expect(isWithinQuietHours(now, { ...LONDON, end: null })).toBe(false);
    expect(isWithinQuietHours(now, { start: "22:00", end: "22:00", timeZone: "UTC" })).toBe(
      false,
    );
  });

  it("respects the agency timezone, not the host's", () => {
    // 02:00 UTC is 13:00 in Sydney — daytime, so NOT quiet there.
    const instant = new Date("2026-01-15T02:00:00Z");
    expect(isWithinQuietHours(instant, { ...LONDON, timeZone: "Australia/Sydney" })).toBe(
      false,
    );
    expect(isWithinQuietHours(instant, LONDON)).toBe(true);
  });
});

describe("quietHoursEndInstant across DST", () => {
  it("lands on 07:00 wall-clock the morning the UK clocks go forward", () => {
    // 29 March 2026, 01:00 UTC → 02:00 BST. Quiet hours started 22:00 the 28th.
    const duringWindow = new Date("2026-03-29T00:30:00Z");
    const end = quietHoursEndInstant(duringWindow, LONDON);
    expect(end).not.toBeNull();
    // The whole point: 07:00 on the clock, NOT nine hours after 22:00 (which
    // would be 06:00 after the spring-forward hour disappears).
    expect(minutesOfDay(end as Date, "Europe/London")).toBe(7 * 60);
  });

  it("lands on 07:00 wall-clock the morning the UK clocks go back", () => {
    // 25 October 2026 — the 01:00–02:00 hour repeats.
    const duringWindow = new Date("2026-10-25T00:30:00Z");
    const end = quietHoursEndInstant(duringWindow, LONDON);
    expect(end).not.toBeNull();
    expect(minutesOfDay(end as Date, "Europe/London")).toBe(7 * 60);
  });

  it("rolls to tomorrow when entered before midnight", () => {
    const at23 = zonedWallClockToInstant(
      { year: 2026, month: 1, day: 15, hour: 23, minute: 0 },
      "Europe/London",
    );
    const end = quietHoursEndInstant(at23, LONDON) as Date;
    expect(end.getTime()).toBeGreaterThan(at23.getTime());
    // Within nine hours: 23:00 → 07:00 next day is eight.
    expect(end.getTime() - at23.getTime()).toBeLessThan(9 * 3600 * 1000);
  });

  it("stays on today when entered after midnight", () => {
    const at02 = zonedWallClockToInstant(
      { year: 2026, month: 1, day: 15, hour: 2, minute: 0 },
      "Europe/London",
    );
    const end = quietHoursEndInstant(at02, LONDON) as Date;
    expect(end.getTime() - at02.getTime()).toBe(5 * 3600 * 1000);
  });
});

describe("applyQuietHours", () => {
  it("defers rather than dropping", () => {
    const night = new Date("2026-01-15T02:00:00Z");
    const decision = applyQuietHours(night, LONDON, false);
    expect(decision.deferred).toBe(true);
    if (decision.deferred) {
      expect(decision.deliverAt.getTime()).toBeGreaterThan(night.getTime());
    }
  });

  it("sends immediately when the override is set — §6.6 critical alerts", () => {
    const night = new Date("2026-01-15T02:00:00Z");
    expect(applyQuietHours(night, LONDON, true)).toEqual({ deferred: false });
  });

  it("sends immediately outside the window", () => {
    const midday = new Date("2026-01-15T12:00:00Z");
    expect(applyQuietHours(midday, LONDON, false)).toEqual({ deferred: false });
  });
});
