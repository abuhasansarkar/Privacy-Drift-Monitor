import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@pdm/database";
import { makeAgency, makeWebsite, resetDatabase } from "@pdm/database/testing";
import { GRACE_DAYS } from "@pdm/billing";
import { sweepGrace } from "../grace";

/**
 * THE GRACE SWEEP AGAINST A REAL DATABASE — PLAN.md §9.2, Phase 6 task 6.2.
 *
 * ⚠️ `grace.test.ts` IN `packages/billing` PROVES THE ARITHMETIC; THIS PROVES
 * THE CONSEQUENCE. The decision is pure and already covered — what has to be
 * asserted here is that acting on it never removes a row, never touches a site
 * that should not be touched, and does not send the same email every night.
 *
 * ⚠️ THE EMAIL QUEUE IS `null`. Enqueuing is asserted in the email suite; what
 * matters here is that a missing queue never stops the pause from happening —
 * a Redis outage must not silently disable a data-minimization behaviour.
 */

const NOW = new Date("2026-09-15T09:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

async function subscribe(
  agencyId: string,
  overrides: { maxWebsites?: number; graceStartedAt?: Date | null; status?: string } = {},
) {
  const plan = await prisma.plan.findUniqueOrThrow({ where: { key: "starter" } });
  return prisma.subscription.create({
    data: {
      agencyId,
      planId: plan.id,
      stripeCustomerId: `cus_${agencyId}`,
      status: (overrides.status ?? "ACTIVE") as never,
      graceStartedAt: overrides.graceStartedAt ?? null,
      entitlementOverrides:
        overrides.maxWebsites === undefined ? undefined : { maxWebsites: overrides.maxWebsites },
    },
  });
}

/** Sites created oldest-first, so `label` encodes the age order. */
async function seedSites(agencyId: string, count: number) {
  const made = [];
  for (let index = 0; index < count; index += 1) {
    const site = await makeWebsite(agencyId, { label: `site-${index}` });
    await prisma.website.update({
      where: { id: site.id },
      data: { createdAt: daysAgo(100 - index) },
    });
    made.push(site);
  }
  return made;
}

describe("sweepGrace", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("does nothing to an agency within its limit", async () => {
    const agency = await makeAgency();
    await subscribe(agency.id, { maxWebsites: 5 });
    await seedSites(agency.id, 3);

    const result = await sweepGrace(null, NOW);

    expect(result.outcomes[0]?.state).toBe("clear");
    expect(result.paused).toBe(0);
    const subscription = await prisma.subscription.findFirstOrThrow({
      where: { agencyId: agency.id },
    });
    expect(subscription.graceStartedAt).toBeNull();
  });

  it("starts the clock on the first overage and pauses nothing that day", async () => {
    const agency = await makeAgency();
    await subscribe(agency.id, { maxWebsites: 2 });
    await seedSites(agency.id, 5);

    const result = await sweepGrace(null, NOW);

    expect(result.entered).toBe(1);
    expect(result.paused).toBe(0);
    const subscription = await prisma.subscription.findFirstOrThrow({
      where: { agencyId: agency.id },
    });
    expect(subscription.graceStartedAt?.toISOString()).toBe(NOW.toISOString());
    // The point of a grace period: everything is still being monitored.
    const active = await prisma.website.count({
      where: { agencyId: agency.id, monitoringStatus: "ACTIVE" },
    });
    expect(active).toBe(5);
  });

  it("⚠️ PAUSES THE OLDEST EXCESS SITES AND DELETES NOTHING once the window elapses", async () => {
    const agency = await makeAgency();
    await subscribe(agency.id, { maxWebsites: 2, graceStartedAt: daysAgo(GRACE_DAYS + 1) });
    await seedSites(agency.id, 5);

    const result = await sweepGrace(null, NOW);

    expect(result.paused).toBe(3);

    const sites = await prisma.website.findMany({
      where: { agencyId: agency.id },
      orderBy: { createdAt: "asc" },
      select: { label: true, monitoringStatus: true, archivedAt: true, nextScanAt: true },
    });

    /*
     * ⚠️ THE ROW COUNT IS THE ASSERTION THAT MATTERS. §9.2: "auto-paused (never
     * deleted)". Everything else in this test could pass while the sweep
     * quietly removed three websites and their entire scan history.
     */
    expect(sites).toHaveLength(5);
    expect(sites.every((site) => site.archivedAt === null)).toBe(true);

    expect(sites.map((site) => site.monitoringStatus)).toEqual([
      "PAUSED",
      "PAUSED",
      "PAUSED",
      "ACTIVE",
      "ACTIVE",
    ]);
    // A paused site with a due date starts scanning again the moment anyone
    // flips the status back without thinking about the date.
    expect(sites.slice(0, 3).every((site) => site.nextScanAt === null)).toBe(true);
  });

  it("is idempotent — a second run the same night pauses nothing more", async () => {
    const agency = await makeAgency();
    await subscribe(agency.id, { maxWebsites: 2, graceStartedAt: daysAgo(GRACE_DAYS + 1) });
    await seedSites(agency.id, 5);

    await sweepGrace(null, NOW);
    const second = await sweepGrace(null, NOW);

    expect(second.paused).toBe(0);
    const paused = await prisma.website.count({
      where: { agencyId: agency.id, monitoringStatus: "PAUSED" },
    });
    expect(paused).toBe(3);
  });

  it("clears a stale window once the agency is back within its limit", async () => {
    const agency = await makeAgency();
    await subscribe(agency.id, { maxWebsites: 5, graceStartedAt: daysAgo(13) });
    await seedSites(agency.id, 3);

    const result = await sweepGrace(null, NOW);

    expect(result.cleared).toBe(1);
    const subscription = await prisma.subscription.findFirstOrThrow({
      where: { agencyId: agency.id },
    });
    // Otherwise an agency that complied on day 13 gets one day of grace the
    // next time it goes over, instead of fourteen.
    expect(subscription.graceStartedAt).toBeNull();
  });

  it("skips an agency already in read-only — it is not punished twice", async () => {
    const agency = await makeAgency();
    await subscribe(agency.id, {
      maxWebsites: 2,
      status: "PAST_DUE",
      graceStartedAt: daysAgo(GRACE_DAYS + 1),
    });
    await seedSites(agency.id, 5);

    const result = await sweepGrace(null, NOW);

    expect(result.agenciesChecked).toBe(0);
    const active = await prisma.website.count({
      where: { agencyId: agency.id, monitoringStatus: "ACTIVE" },
    });
    expect(active).toBe(5);
  });

  it("never touches an agency with no subscription row", async () => {
    const agency = await makeAgency();
    await seedSites(agency.id, 40);

    const result = await sweepGrace(null, NOW);

    expect(result.agenciesChecked).toBe(0);
    expect(result.paused).toBe(0);
  });

  it("ignores an archived site when counting, so archiving is a real way down", async () => {
    const agency = await makeAgency();
    await subscribe(agency.id, { maxWebsites: 2, graceStartedAt: daysAgo(GRACE_DAYS + 1) });
    const sites = await seedSites(agency.id, 4);
    await prisma.website.update({
      where: { id: sites[0]!.id },
      data: { archivedAt: NOW },
    });
    await prisma.website.update({
      where: { id: sites[1]!.id },
      data: { archivedAt: NOW },
    });

    const result = await sweepGrace(null, NOW);

    expect(result.outcomes[0]?.state).toBe("clear");
    expect(result.paused).toBe(0);
  });
});
