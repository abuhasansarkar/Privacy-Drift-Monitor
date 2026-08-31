import type { NotificationType, Severity } from "@pdm/schemas";
import { toWallClock, zonedWallClockToInstant } from "./timezone";

/**
 * DIGESTS — PLAN.md Part VI §6.6, feature doc 13.
 *
 * ⚠️ ONE REPEATABLE JOB PER DISTINCT TIMEZONE, NEVER ONE PER AGENCY. Ten
 * thousand agencies across ~40 zones is 40 jobs, not 10,000 — and BullMQ's
 * repeatable-job set is scanned on every tick, so per-agency scheduling
 * degrades the whole queue, not just the digest.
 *
 * ⚠️ 08:00 IS A WALL-CLOCK TIME, not "07:00 UTC". A digest that arrives at
 * 09:00 for half the year is a digest people stop reading.
 */

export const DIGEST_HOUR = 8;
/** Monday, matching `Date.prototype.getDay`. */
export const WEEKLY_DIGEST_WEEKDAY = 1;

/** The next 08:00 in `timeZone` strictly after `now`. */
export function nextDailyDigestAt(now: Date, timeZone: string): Date {
  const wall = toWallClock(now, timeZone);
  const today = zonedWallClockToInstant(
    { year: wall.year, month: wall.month, day: wall.day, hour: DIGEST_HOUR, minute: 0 },
    timeZone,
  );
  if (today.getTime() > now.getTime()) return today;
  return zonedWallClockToInstant(
    {
      year: wall.year,
      month: wall.month,
      // `Date.UTC` normalises the overflow, so month and year roll over for free.
      day: wall.day + 1,
      hour: DIGEST_HOUR,
      minute: 0,
    },
    timeZone,
  );
}

/** The next Monday 08:00 in `timeZone` strictly after `now`. */
export function nextWeeklyDigestAt(now: Date, timeZone: string): Date {
  const wall = toWallClock(now, timeZone);
  let daysAhead = (WEEKLY_DIGEST_WEEKDAY - wall.weekday + 7) % 7;

  if (daysAhead === 0) {
    const todayEight = zonedWallClockToInstant(
      { year: wall.year, month: wall.month, day: wall.day, hour: DIGEST_HOUR, minute: 0 },
      timeZone,
    );
    if (todayEight.getTime() > now.getTime()) return todayEight;
    daysAhead = 7;
  }

  return zonedWallClockToInstant(
    {
      year: wall.year,
      month: wall.month,
      day: wall.day + daysAhead,
      hour: DIGEST_HOUR,
      minute: 0,
    },
    timeZone,
  );
}

/** The window a digest run covers, ending at the run instant. */
export function digestWindow(
  runAt: Date,
  frequency: "DAILY" | "WEEKLY",
): { from: Date; to: Date } {
  const days = frequency === "DAILY" ? 1 : 7;
  return { from: new Date(runAt.getTime() - days * 24 * 3600 * 1000), to: runAt };
}

export interface DigestItem {
  type: NotificationType;
  severity: Severity;
  title: string;
  body: string;
  linkUrl: string | null;
  websiteId: string | null;
  websiteLabel: string;
  createdAt: Date;
}

export interface DigestGroup {
  websiteId: string | null;
  websiteLabel: string;
  /** Highest severity in the group — drives the ordering below. */
  topSeverity: Severity;
  items: DigestItem[];
}

const SEVERITY_RANK: Record<Severity, number> = {
  INFO: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

/**
 * Groups a period's notifications by website, worst first.
 *
 * §6.6 fixes the grouping as "grouped by website": an agency reads a digest
 * site by site, because that is how they decide who to email about it. Grouping
 * by severity instead would scatter one client's three findings across three
 * sections.
 */
export function groupDigest(items: readonly DigestItem[]): DigestGroup[] {
  const groups = new Map<string, DigestGroup>();

  for (const item of items) {
    const key = item.websiteId ?? "__agency__";
    const existing = groups.get(key);
    if (existing) {
      existing.items.push(item);
      if (SEVERITY_RANK[item.severity] > SEVERITY_RANK[existing.topSeverity]) {
        existing.topSeverity = item.severity;
      }
      continue;
    }
    groups.set(key, {
      websiteId: item.websiteId,
      websiteLabel: item.websiteLabel,
      topSeverity: item.severity,
      items: [item],
    });
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      items: [...group.items].sort(
        (a, b) =>
          SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] ||
          b.createdAt.getTime() - a.createdAt.getTime(),
      ),
    }))
    .sort(
      (a, b) =>
        SEVERITY_RANK[b.topSeverity] - SEVERITY_RANK[a.topSeverity] ||
        b.items.length - a.items.length ||
        a.websiteLabel.localeCompare(b.websiteLabel),
    );
}

/** Counts by severity for the digest's summary line. */
export function digestTotals(
  groups: readonly DigestGroup[],
): { total: number; bySeverity: Record<Severity, number> } {
  const bySeverity: Record<Severity, number> = {
    CRITICAL: 0,
    HIGH: 0,
    MEDIUM: 0,
    LOW: 0,
    INFO: 0,
  };
  let total = 0;
  for (const group of groups) {
    for (const item of group.items) {
      bySeverity[item.severity] += 1;
      total += 1;
    }
  }
  return { total, bySeverity };
}
