import { describe, expect, it } from "vitest";
import { GRACE_DAYS, countToPause, resolveGrace, selectSitesToPause } from "../grace";

/**
 * GRACE ON DOWNGRADE — PLAN.md §9.2, feature doc 17 rule 4.
 *
 * ⚠️ THE RULE THIS SUITE DEFENDS IS "NEVER DELETE". Every assertion below is
 * ultimately about the same promise: an agency that drops a plan loses no data
 * and no site, gets two weeks of notice, and can undo whatever we do.
 */

const NOW = new Date("2026-09-01T12:00:00Z");
const day = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

describe("resolveGrace", () => {
  it("is clear when under the limit", () => {
    const result = resolveGrace({
      websiteCount: 9,
      maxWebsites: 10,
      graceStartedAt: null,
      now: NOW,
    });
    expect(result.state).toBe("clear");
    expect(result.excess).toBe(0);
  });

  it("is clear at exactly the limit — a full plan is not a downgrade casualty", () => {
    const result = resolveGrace({
      websiteCount: 10,
      maxWebsites: 10,
      graceStartedAt: null,
      now: NOW,
    });
    expect(result.state).toBe("clear");
  });

  it("⚠️ IS ALWAYS CLEAR ON AN UNLIMITED PLAN", () => {
    /*
     * `websiteCount > -1` is true for every count, so a naive comparison would
     * put every Scale agency into permanent grace and then pause every site
     * they own. This is the `-1` trap §9.2 warns about, in the one place where
     * getting it wrong destroys a customer's monitoring.
     */
    const result = resolveGrace({
      websiteCount: 4_000,
      maxWebsites: -1,
      graceStartedAt: null,
      now: NOW,
    });
    expect(result.state).toBe("clear");
  });

  it("starts a 14-day window the first time it sees an overage — and pauses nothing that day", () => {
    const result = resolveGrace({
      websiteCount: 14,
      maxWebsites: 10,
      graceStartedAt: null,
      now: NOW,
    });
    expect(result.state).toBe("grace");
    expect(result.excess).toBe(4);
    expect(result.daysLeft).toBe(GRACE_DAYS);
  });

  it("counts days down by ceiling, so the last partial day still reads as a day", () => {
    const result = resolveGrace({
      websiteCount: 12,
      maxWebsites: 10,
      graceStartedAt: day(-13.2),
      now: NOW,
    });
    expect(result.state).toBe("grace");
    expect(result.daysLeft).toBe(1);
  });

  it("expires exactly at the boundary, not a day early", () => {
    const before = resolveGrace({
      websiteCount: 12,
      maxWebsites: 10,
      graceStartedAt: day(-GRACE_DAYS + 0.01),
      now: NOW,
    });
    expect(before.state).toBe("grace");

    const at = resolveGrace({
      websiteCount: 12,
      maxWebsites: 10,
      graceStartedAt: day(-GRACE_DAYS),
      now: NOW,
    });
    expect(at.state).toBe("expired");
    expect(at.daysLeft).toBe(0);
  });

  it("going back under the limit clears the window, even mid-grace", () => {
    /*
     * ⚠️ THE CALLER NULLS THE STORED START WHEN IT SEES THIS. Without it, an
     * agency that archived down on day 13 and later added one site back would
     * get one day of grace instead of fourteen — punished for having complied.
     */
    const result = resolveGrace({
      websiteCount: 10,
      maxWebsites: 10,
      graceStartedAt: day(-13),
      now: NOW,
    });
    expect(result.state).toBe("clear");
    expect(result.endsAt).toBeNull();
  });
});

describe("selectSitesToPause", () => {
  const sites = [
    { id: "c", createdAt: new Date("2026-03-01T00:00:00Z") },
    { id: "a", createdAt: new Date("2026-01-01T00:00:00Z") },
    { id: "d", createdAt: new Date("2026-04-01T00:00:00Z") },
    { id: "b", createdAt: new Date("2026-02-01T00:00:00Z") },
  ];

  it("takes the oldest first, as §9.2 specifies", () => {
    expect(selectSitesToPause(sites, 2).map((s) => s.id)).toEqual(["a", "b"]);
  });

  it("selects nothing when there is no excess", () => {
    expect(selectSitesToPause(sites, 0)).toEqual([]);
    expect(selectSitesToPause(sites, -3)).toEqual([]);
  });

  it("never selects more than exist", () => {
    expect(selectSitesToPause(sites, 99)).toHaveLength(4);
  });

  it("breaks ties on id so the email and the action cannot disagree", () => {
    // A CSV import creates sites in the same millisecond routinely.
    const sameInstant = [
      { id: "z", createdAt: new Date("2026-01-01T00:00:00Z") },
      { id: "y", createdAt: new Date("2026-01-01T00:00:00Z") },
      { id: "x", createdAt: new Date("2026-01-01T00:00:00Z") },
    ];
    expect(selectSitesToPause(sameInstant, 2).map((s) => s.id)).toEqual(["x", "y"]);
  });

  it("does not mutate its input", () => {
    const order = sites.map((s) => s.id);
    selectSitesToPause(sites, 3);
    expect(sites.map((s) => s.id)).toEqual(order);
  });
});

describe("countToPause", () => {
  it("is the surplus of ACTIVE sites, not of all sites", () => {
    /*
     * ⚠️ THE REGRESSION THIS FUNCTION EXISTS FOR. With 5 sites on a 2-site plan
     * and 3 already paused, `excess` is still 3 — but only 2 are active, and
     * pausing 3 of them means pausing both. The sweep did exactly that on its
     * second night before a DB-backed test caught it.
     */
    expect(countToPause(5, 2)).toBe(3);
    expect(countToPause(2, 2)).toBe(0);
  });

  it("never returns a negative", () => {
    expect(countToPause(1, 10)).toBe(0);
  });

  it("pauses nothing on an unlimited plan", () => {
    expect(countToPause(4_000, -1)).toBe(0);
  });
});
