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
 * ⚠️ PARTIAL, DELIBERATELY, AND THE GAP IS STATED RATHER THAN HIDDEN. §11.13's
 * order is:
 *
 *     agency override → plan targeting → percentage rollout → global default
 *
 * Steps 1, 3 and 4 work here. **Plan targeting does not**, because there is no
 * plan: `Subscription` is unpopulated until billing lands in Phase 6. A flag
 * that claims to target a plan it cannot read would silently resolve every
 * agency the same way, which is worse than a documented hole — so the step is
 * absent and named, and Phase 6 fills in one function.
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

      // 2. Plan targeting — NOT IMPLEMENTED. See the header note.

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
