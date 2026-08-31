import { describe, expect, it } from "vitest";
import {
  digestTotals,
  digestWindow,
  groupDigest,
  nextDailyDigestAt,
  nextWeeklyDigestAt,
  type DigestItem,
} from "../digest";
import { toWallClock } from "../timezone";
import {
  ROLLUP_THRESHOLD,
  rollup,
  shouldAlertUnreachable,
  dedupeKey,
} from "../dedupe";

function item(over: Partial<DigestItem>): DigestItem {
  return {
    type: "NEW_TRACKER",
    severity: "MEDIUM",
    title: "New tracker detected",
    body: "",
    linkUrl: null,
    websiteId: "site-1",
    websiteLabel: "example.com",
    createdAt: new Date("2026-01-15T09:00:00Z"),
    ...over,
  };
}

describe("digest scheduling", () => {
  it("picks today's 08:00 when it is still ahead", () => {
    const now = new Date("2026-01-15T05:00:00Z"); // 05:00 London
    const at = nextDailyDigestAt(now, "Europe/London");
    expect(toWallClock(at, "Europe/London").hour).toBe(8);
    expect(toWallClock(at, "Europe/London").day).toBe(15);
  });

  it("rolls to tomorrow once 08:00 has passed", () => {
    const now = new Date("2026-01-15T09:00:00Z");
    const at = nextDailyDigestAt(now, "Europe/London");
    expect(toWallClock(at, "Europe/London").day).toBe(16);
  });

  it("is 08:00 on the clock in every zone, not a fixed UTC hour", () => {
    const now = new Date("2026-01-15T00:00:00Z");
    for (const zone of ["Europe/London", "Australia/Sydney", "America/Los_Angeles"]) {
      expect(toWallClock(nextDailyDigestAt(now, zone), zone).hour).toBe(8);
    }
  });

  it("stays at 08:00 wall-clock across a DST transition", () => {
    // The evening before the UK springs forward.
    const now = new Date("2026-03-28T20:00:00Z");
    const at = nextDailyDigestAt(now, "Europe/London");
    const wall = toWallClock(at, "Europe/London");
    expect(wall.hour).toBe(8);
    expect(wall.day).toBe(29);
  });

  it("finds the next Monday 08:00 for the weekly summary", () => {
    // 15 January 2026 is a Thursday.
    const now = new Date("2026-01-15T09:00:00Z");
    const at = nextWeeklyDigestAt(now, "Europe/London");
    const wall = toWallClock(at, "Europe/London");
    expect(wall.weekday).toBe(1);
    expect(wall.hour).toBe(8);
  });

  it("rolls a Monday past 08:00 to the following Monday", () => {
    const monday = new Date("2026-01-19T09:00:00Z");
    const at = nextWeeklyDigestAt(monday, "Europe/London");
    expect(toWallClock(at, "Europe/London").day).toBe(26);
  });

  it("covers a 24-hour window for daily and 7 days for weekly", () => {
    const runAt = new Date("2026-01-15T08:00:00Z");
    expect(digestWindow(runAt, "DAILY").from).toEqual(new Date("2026-01-14T08:00:00Z"));
    expect(digestWindow(runAt, "WEEKLY").from).toEqual(new Date("2026-01-08T08:00:00Z"));
  });
});

describe("groupDigest", () => {
  it("groups a day's items by website, worst first", () => {
    const groups = groupDigest([
      item({ websiteId: "a", websiteLabel: "a.test", severity: "LOW" }),
      item({ websiteId: "b", websiteLabel: "b.test", severity: "CRITICAL" }),
      item({ websiteId: "a", websiteLabel: "a.test", severity: "MEDIUM" }),
    ]);
    expect(groups.map((g) => g.websiteLabel)).toEqual(["b.test", "a.test"]);
    expect(groups[0]?.topSeverity).toBe("CRITICAL");
    expect(groups[1]?.items).toHaveLength(2);
    // Worst first inside a group too.
    expect(groups[1]?.items[0]?.severity).toBe("MEDIUM");
  });

  it("keeps agency-level items (no website) in their own group", () => {
    const groups = groupDigest([
      item({ websiteId: null, websiteLabel: "Your portfolio", type: "REPORT_READY" }),
      item({ websiteId: "a", websiteLabel: "a.test" }),
    ]);
    expect(groups).toHaveLength(2);
  });

  it("counts totals by severity for the summary line", () => {
    const totals = digestTotals(
      groupDigest([
        item({ severity: "CRITICAL" }),
        item({ severity: "MEDIUM" }),
        item({ severity: "MEDIUM" }),
      ]),
    );
    expect(totals.total).toBe(3);
    expect(totals.bySeverity.MEDIUM).toBe(2);
    expect(totals.bySeverity.LOW).toBe(0);
  });
});

describe("flood control", () => {
  it("keys suppression on agency + type + entity, never on the recipient", () => {
    expect(dedupeKey({ agencyId: "a", type: "NEW_TRACKER", entityId: "i1" })).toBe(
      "a:NEW_TRACKER:i1",
    );
    expect(dedupeKey({ agencyId: "a", type: "NEW_TRACKER", entityId: null })).toBe(
      "a:NEW_TRACKER:-",
    );
  });

  it("collapses more than ten issues from one scan into a single alert", () => {
    const many = Array.from({ length: ROLLUP_THRESHOLD + 1 }, (_, i) => i);
    const decision = rollup({ items: many, websiteLabel: "example.com" });
    expect(decision.kind).toBe("rollup");
    if (decision.kind === "rollup") expect(decision.count).toBe(11);
  });

  it("leaves a normal scan's issues individual", () => {
    const decision = rollup({ items: [1, 2, 3], websiteLabel: "example.com" });
    expect(decision.kind).toBe("individual");
  });

  it("alerts on the third consecutive failure, then at most daily", () => {
    const now = new Date("2026-01-15T12:00:00Z");
    expect(shouldAlertUnreachable({ consecutiveFailures: 2, lastAlertedAt: null, now })).toBe(
      false,
    );
    expect(shouldAlertUnreachable({ consecutiveFailures: 3, lastAlertedAt: null, now })).toBe(
      true,
    );
    expect(
      shouldAlertUnreachable({
        consecutiveFailures: 9,
        lastAlertedAt: new Date("2026-01-15T06:00:00Z"),
        now,
      }),
    ).toBe(false);
    expect(
      shouldAlertUnreachable({
        consecutiveFailures: 9,
        lastAlertedAt: new Date("2026-01-14T06:00:00Z"),
        now,
      }),
    ).toBe(true);
  });
});
