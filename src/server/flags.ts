import "server-only";
import { cache } from "react";
import { unsafeGlobalClient } from "@pdm/database";
import {
  FLAGS,
  FLAG_DEFAULTS,
  isInRollout,
  type FlagKey,
} from "@pdm/shared/flags";

/**
 * FEATURE FLAG RESOLUTION — PLAN.md Part XI §11.13, Phase 5 task 5.7.
 *
 * §11.13's resolution order, complete as of Phase 6 task 6.7:
 *
 *     agency override → plan targeting → percentage rollout → global default
 *
 * ⚠️ STEP 2 WAS ABSENT UNTIL BILLING EXISTED, and it was absent rather than
 * stubbed: a flag that claims to target a plan it cannot read resolves every
 * agency identically while looking like it works, which is worse than a
 * documented hole. `Subscription` is now populated, so the step is real.
 *
 * ⚠️ THE ORDER IS NOT INTERCHANGEABLE. Each step is MORE specific than the one
 * after it, and each returns outright rather than falling through. Checking the
 * rollout before the plan would give a Scale customer a feature we sold them
 * only if their agency id happened to hash into the bucket.
 *
 * ⚠️ THE KILL SWITCHES RESOLVE THROUGH HERE TOO. `AI_AUTO_EXPLAIN` off must
 * "stop all automatic AI spend instantly" (§11.13, feature doc 16), which is
 * only true if the check is a live read rather than a build-time constant. The
 * per-request cache below is what keeps that affordable.
 */

/**
 * ⚠️ `unsafeGlobalClient` IS CORRECT HERE, and the justification is required in
 * review: `FeatureFlag` is a GLOBAL table (one row per flag, platform-wide) and
 * `FeatureFlagOverride` is looked up by an `agencyId` this function is given by
 * the caller's session — never by one a request can choose. `forAgency()` would
 * scope the join to a tenant column `FeatureFlag` does not have.
 */
const db = unsafeGlobalClient(
  "feature flag definitions are global; the override is filtered by a session-derived agencyId",
);

/**
 * Resolves one flag for one agency.
 *
 * ⚠️ CACHED PER REQUEST, NOT PER PROCESS. §11.13 allows a 60-second cache, and
 * a process-level one would make a kill switch take a minute to bite on a warm
 * server — during an incident, that minute is the whole point of the switch.
 * React's `cache()` dedupes within a single render, which is what a page that
 * checks the same flag in a layout and a page actually needs.
 */
export const isFlagEnabled = cache(
  async (flag: FlagKey, agencyId: string): Promise<boolean> => {
    try {
      const record = await db.featureFlag.findFirst({
        where: { key: flag },
        include: { overrides: { where: { agencyId } } },
      });

      // No row means the flag has never been provisioned in this environment.
      // The compiled-in default is the answer, and for everything past the MVP
      // boundary that default is `false` (§2.1).
      if (!record) return FLAG_DEFAULTS[flag];

      // 1. Agency override — the most specific rule wins outright.
      const override = record.overrides[0];
      if (override) return override.enabled;

      /*
       * 2. Plan targeting. An empty `planKeys` means "not targeted at a plan"
       *    and falls through — it does NOT mean "no plan qualifies", which is
       *    the reading that would switch every flag off for everybody.
       *
       * ⚠️ A NON-EMPTY LIST IS AUTHORITATIVE IN BOTH DIRECTIONS. An agency on a
       * listed plan gets the feature regardless of the rollout percentage
       * (they were sold it); an agency on any other plan does NOT get it, even
       * at 100% rollout. A flag that says "Agency and Scale only" and then
       * leaks to Starter through a rollout dial is a paid feature given away.
       */
      if (record.planKeys.length > 0) {
        const subscription = await db.subscription.findFirst({
          where: { agencyId },
          select: { plan: { select: { key: true } } },
        });
        // No subscription is not a plan, so it cannot match a targeted flag.
        return subscription
          ? record.planKeys.includes(subscription.plan.key)
          : false;
      }

      // 3. Percentage rollout, bucketed on a stable hash of `agencyId` so an
      //    agency never sees the feature flicker between requests.
      if (record.rolloutPercent > 0) {
        return isInRollout(agencyId, flag, record.rolloutPercent);
      }

      // 4. The flag's own global default.
      return record.enabled;
    } catch {
      /*
       * ⚠️ FAILS TO THE COMPILED-IN DEFAULT, NEVER TO `true`. A database blip
       * must not switch a feature on for everyone — and for the two kill
       * switches (`AI_AUTO_EXPLAIN`, `ADVANCED_SCAN`) the compiled default is
       * `false`, so an outage cannot re-enable something an operator turned off
       * during an incident.
       */
      return FLAG_DEFAULTS[flag];
    }
  },
);

export { FLAGS, FLAG_DEFAULTS };
export type { FlagKey };
