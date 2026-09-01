import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@pdm/database";
import { makeAgency, resetDatabase } from "@pdm/database/testing";
import { FLAG_DEFAULTS, FLAGS, rolloutBucket } from "@pdm/shared/flags";

/**
 * FLAG RESOLUTION — PLAN.md §11.13, Phase 6 task 6.7.
 *
 * The acceptance criterion is the ORDER: "agency override → plan targeting →
 * percentage rollout → global default". Each step below is asserted to WIN over
 * the ones after it, because a resolution order is only meaningful if the more
 * specific rule actually stops the less specific one from running.
 *
 * ⚠️ `isFlagEnabled` IS `cache()`-WRAPPED, so each test re-imports the module.
 * Without it the second assertion in a test reads the first one's answer.
 */

async function resolver() {
  vi.resetModules();
  const flags = await import("@/server/flags");
  return flags.isFlagEnabled;
}

const FLAG = FLAGS.AI_ASSISTANT_PAGE;

async function upsertFlag(data: {
  enabled?: boolean;
  rolloutPercent?: number;
  planKeys?: string[];
}) {
  return prisma.featureFlag.upsert({
    where: { key: FLAG },
    create: {
      key: FLAG,
      enabled: data.enabled ?? false,
      rolloutPercent: data.rolloutPercent ?? 0,
      planKeys: data.planKeys ?? [],
    },
    update: {
      enabled: data.enabled ?? false,
      rolloutPercent: data.rolloutPercent ?? 0,
      planKeys: data.planKeys ?? [],
    },
  });
}

async function subscribe(agencyId: string, planKey: string) {
  const plan = await prisma.plan.findUniqueOrThrow({ where: { key: planKey } });
  await prisma.subscription.create({
    data: {
      agencyId,
      planId: plan.id,
      stripeCustomerId: `cus_${agencyId}`,
      status: "ACTIVE",
    },
  });
}

describe("isFlagEnabled", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("falls back to the compiled-in default when the flag has no row", async () => {
    const agency = await makeAgency();
    await prisma.featureFlag.deleteMany({ where: { key: FLAG } });

    const isFlagEnabled = await resolver();
    expect(await isFlagEnabled(FLAG, agency.id)).toBe(FLAG_DEFAULTS[FLAG]);
  });

  it("uses the global default when nothing more specific applies", async () => {
    const agency = await makeAgency();
    await upsertFlag({ enabled: true });

    const isFlagEnabled = await resolver();
    expect(await isFlagEnabled(FLAG, agency.id)).toBe(true);
  });

  it("⚠️ AN AGENCY OVERRIDE WINS OVER EVERYTHING, including a 100% rollout", async () => {
    const agency = await makeAgency();
    const flag = await upsertFlag({ enabled: true, rolloutPercent: 100 });
    await prisma.featureFlagOverride.create({
      data: { flagId: flag.id, agencyId: agency.id, enabled: false },
    });

    const isFlagEnabled = await resolver();
    // An override that could be overruled by a rollout dial is not an override,
    // and the case it exists for is "turn this off for the one customer it is
    // breaking, right now".
    expect(await isFlagEnabled(FLAG, agency.id)).toBe(false);
  });

  it("⚠️ PLAN TARGETING WINS OVER THE ROLLOUT in both directions", async () => {
    const included = await makeAgency();
    const excluded = await makeAgency();
    await subscribe(included.id, "scale");
    await subscribe(excluded.id, "starter");
    // Rollout at 0: a targeted plan still gets it.
    await upsertFlag({ enabled: false, rolloutPercent: 0, planKeys: ["scale"] });

    let isFlagEnabled = await resolver();
    expect(await isFlagEnabled(FLAG, included.id)).toBe(true);

    isFlagEnabled = await resolver();
    expect(await isFlagEnabled(FLAG, excluded.id)).toBe(false);

    // Rollout at 100: a non-targeted plan still does NOT get it. A flag that
    // says "Agency and Scale only" and leaks to Starter through a dial is a
    // paid feature given away.
    await upsertFlag({ enabled: true, rolloutPercent: 100, planKeys: ["scale"] });
    isFlagEnabled = await resolver();
    expect(await isFlagEnabled(FLAG, excluded.id)).toBe(false);
  });

  it("an empty planKeys list means 'not targeted', not 'nobody qualifies'", async () => {
    const agency = await makeAgency();
    await subscribe(agency.id, "starter");
    await upsertFlag({ enabled: true, planKeys: [] });

    const isFlagEnabled = await resolver();
    expect(await isFlagEnabled(FLAG, agency.id)).toBe(true);
  });

  it("a targeted flag is off for an agency with no subscription at all", async () => {
    const agency = await makeAgency();
    await upsertFlag({ enabled: true, rolloutPercent: 100, planKeys: ["scale"] });

    const isFlagEnabled = await resolver();
    expect(await isFlagEnabled(FLAG, agency.id)).toBe(false);
  });

  it("bucketing is stable, so a feature never flickers between requests", async () => {
    const agency = await makeAgency();
    const bucket = rolloutBucket(agency.id, FLAG);
    // Set the dial either side of this agency's own bucket.
    await upsertFlag({ enabled: false, rolloutPercent: bucket + 1 });

    let isFlagEnabled = await resolver();
    expect(await isFlagEnabled(FLAG, agency.id)).toBe(true);

    await upsertFlag({ enabled: false, rolloutPercent: bucket });
    isFlagEnabled = await resolver();
    expect(await isFlagEnabled(FLAG, agency.id)).toBe(false);
  });
});
