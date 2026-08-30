/**
 * FEATURE FLAGS — PLAN.md Part XI §11.13.
 *
 * Flags are OPERATIONAL CONTROLS as much as rollout tooling. Three of these are
 * incident kill switches:
 *
 *   AI_AUTO_EXPLAIN     off → stops all automatic AI spend instantly
 *   ADVANCED_SCAN       off → reduces scanner load during an incident
 *   SCORING_ENGINE_V2   shadow mode — compute both, store both, compare, flip
 *
 * Resolution order (§11.13):
 *   agency override → plan targeting → percentage rollout (stable hash of
 *   agencyId) → global default.  Cached 60s in Redis and in process.
 *
 * Every flag needs an OWNER and a REMOVAL DATE recorded in /admin/feature-flags.
 * A flag with neither is technical debt with a config file.
 */

export const FLAGS = {
  AI_ASSISTANT_PAGE: "ai_assistant_page",
  AI_AUTO_EXPLAIN: "ai_auto_explain",
  SLACK_INTEGRATION: "slack_integration",
  WEBHOOKS: "webhooks",
  CLIENT_PORTAL: "client_portal",
  ADVANCED_SCAN: "advanced_scan",
  CMP_ADAPTER_EXPERIMENTAL: "cmp_adapter_experimental",
  SCORING_ENGINE_V2: "scoring_engine_v2",
  NL_SEARCH: "nl_search",
  COPILOT: "copilot",
} as const;

export type FlagKey = (typeof FLAGS)[keyof typeof FLAGS];

/**
 * Defaults used when no override, plan targeting or rollout rule matches.
 * Everything beyond the MVP boundary (§2.1) ships off.
 */
export const FLAG_DEFAULTS: Record<FlagKey, boolean> = {
  [FLAGS.AI_ASSISTANT_PAGE]: false,
  [FLAGS.AI_AUTO_EXPLAIN]: false,
  [FLAGS.SLACK_INTEGRATION]: false,
  [FLAGS.WEBHOOKS]: false,
  [FLAGS.CLIENT_PORTAL]: true,
  [FLAGS.ADVANCED_SCAN]: false,
  [FLAGS.CMP_ADAPTER_EXPERIMENTAL]: false,
  [FLAGS.SCORING_ENGINE_V2]: false,
  [FLAGS.NL_SEARCH]: false,
  [FLAGS.COPILOT]: false,
};

/** Flags that exist to be switched OFF in an incident, not rolled out. */
export const KILL_SWITCHES: readonly FlagKey[] = [
  FLAGS.AI_AUTO_EXPLAIN,
  FLAGS.ADVANCED_SCAN,
] as const;

/**
 * Stable bucket for percentage rollout: the SAME agency must always land in the
 * same bucket, or a user sees the feature flicker on and off between requests.
 * FNV-1a — deterministic, dependency-free, and adequate for bucketing.
 */
export function rolloutBucket(agencyId: string, flag: FlagKey): number {
  let hash = 0x811c9dc5;
  const input = `${flag}:${agencyId}`;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % 100;
}

export function isInRollout(
  agencyId: string,
  flag: FlagKey,
  percentage: number,
): boolean {
  if (percentage <= 0) return false;
  if (percentage >= 100) return true;
  return rolloutBucket(agencyId, flag) < percentage;
}
