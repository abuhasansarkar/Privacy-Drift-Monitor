/**
 * AI CONFIGURATION — PLAN.md Part VIII §8.3, §8.9, Phase 5 task 5.1.
 *
 * ⚠️ MODEL IDS LIVE IN CONFIGURATION, NOT CODE (feature doc 16: "a provider
 * swap is config plus one adapter"). A model id hard-coded in a provider is a
 * deploy for every price change and a code review for every A/B test.
 *
 * Everything here is read from the environment at call time rather than at
 * module load, so the worker picks up an env change on restart without a build
 * and a test can set a variable without resetting module state.
 */

import type { AIFeature, ModelTier } from "./types";

/**
 * PER-FEATURE OUTPUT TOKEN CAPS — §8.9 ("Token caps … Bounds worst case").
 *
 * These are the ceiling on what one call can cost when the model decides to be
 * expansive. They are set just above what the schema's `max()` lengths need, so
 * a runaway generation is cut off rather than billed.
 */
export const MAX_OUTPUT_TOKENS: Record<AIFeature, number> = {
  EXPLAIN_ISSUE: 400,
  RECOMMEND_FIX: 600,
  CLIENT_MESSAGE: 800,
  SUMMARIZE_DRIFT: 500,
  CLASSIFY_TRACKER: 400,
  ROOT_CAUSE: 800,
  DEVELOPER_TASK: 600,
  WEBSITE_SUMMARY: 400,
};

/**
 * FEATURE → TIER — §8.3's mapping table.
 *
 * The standard tier carries the ~90% high-volume path (structured
 * summarisation of supplied facts, which a small model handles well); advanced
 * is reserved for multi-step reasoning over more context. §8.9 puts the saving
 * at ~10× on the common path, which is the single largest cost lever after
 * caching.
 *
 * ⚠️ NO MVP FEATURE USES THE ADVANCED TIER. The only two entries below that map
 * to it — `CLASSIFY_TRACKER` and `ROOT_CAUSE` — are both V1.5 (§8.5). So the
 * advanced model id is configured but unreached today, which is worth knowing
 * before reading the tier-inversion note in `DEFAULT_PRICING`.
 */
export const FEATURE_TIER: Record<AIFeature, ModelTier> = {
  EXPLAIN_ISSUE: "standard",
  RECOMMEND_FIX: "standard",
  CLIENT_MESSAGE: "standard",
  SUMMARIZE_DRIFT: "standard",
  WEBSITE_SUMMARY: "standard",
  DEVELOPER_TASK: "standard",
  CLASSIFY_TRACKER: "advanced",
  ROOT_CAUSE: "advanced",
};

/** §8.9 credit accounting: 1 credit standard, 3 advanced, 0 for a cache hit. */
export const CREDITS_PER_TIER: Record<ModelTier, number> = {
  standard: 1,
  advanced: 3,
};

export interface AIConfig {
  provider: string;
  apiKey: string | null;
  baseUrl: string | null;
  models: Record<ModelTier, string>;
  /** §8.9 hard input budget per call. Enforced by truncating evidence. */
  maxInputTokens: number;
  timeoutMs: number;
  /** §8.9 platform backstop: a global daily spend cap. */
  dailyBudgetUsd: number;
  /**
   * The global off switch. ⚠️ AN OPERATIONAL KILL SWITCH, not a rollout flag —
   * `AI_ENABLED=false` stops every AI call platform-wide on the next request,
   * with no deploy. The agency-level `aiEnabled` and the `AI_AUTO_EXPLAIN`
   * flag are the two narrower switches above it.
   */
  enabled: boolean;
  /** §8.9: a cached response within 7 days is served at zero provider cost. */
  cacheTtlDays: number;
  /**
   * Reasoning effort for models that support it. Default `minimal`.
   *
   * ⚠️ THIS IS WHAT KEEPS §8.9's TOKEN CAPS MEANINGFUL ON A REASONING MODEL.
   * Reasoning tokens are spent out of the SAME `max_output_tokens` allowance as
   * the visible answer. Measured against the live API with `gpt-5-nano` at our
   * 400-token `EXPLAIN_ISSUE` cap: default effort burned **256 tokens on
   * reasoning** before writing a word, leaving ~144 for a schema that needs
   * 400. `effort: "minimal"` brought reasoning to **0**. Raising the caps
   * instead would have meant paying for hidden tokens on the highest-volume
   * path in the product.
   */
  reasoningEffort: string;
}

/**
 * Normalises a configured model id.
 *
 * ⚠️ `.trim()` IS NOT DEFENSIVE PADDING — IT IS A FIX FOR A REAL 400. A model
 * id is matched EXACTLY by the provider, and `.env` had
 * `AI_MODEL_STANDARD=gpt-4o-mini ` with a trailing space. Verified against the
 * live API: the space alone returns
 * `400 model_not_found: The requested model 'GPT-4o-mini ' does not exist.`
 * That status is in `PERMANENT_STATUSES`, so it is correctly never retried —
 * meaning one invisible character presents as "AI is permanently broken", with
 * nothing in the logs pointing at whitespace.
 *
 * ⚠️ CASE IS NOT CORRECTED HERE, DELIBERATELY. `GPT-4o-mini` also 400s (same
 * verification), but silently lower-casing a configured value would hide a
 * genuine typo and would be wrong for any provider whose ids are case-bearing.
 * Whitespace is unambiguously an accident; case is a value.
 */
function modelId(raw: string | undefined, fallback: string): string {
  const trimmed = raw?.trim();
  return trimmed ? trimmed : fallback;
}

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number(raw);
  // ⚠️ A malformed budget falls back to the DEFAULT, never to zero or NaN.
  // `Number("fifty")` is NaN, and `NaN > cap` is false — a typo in
  // AI_DAILY_BUDGET_USD would have disabled the platform spend cap silently,
  // which is the one control that has no backstop behind it.
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function loadAIConfig(env: NodeJS.ProcessEnv = process.env): AIConfig {
  return {
    provider: env.AI_PROVIDER ?? "openai",
    apiKey: env.AI_API_KEY || null,
    baseUrl: env.AI_BASE_URL || null,
    models: {
      standard: modelId(env.AI_MODEL_STANDARD, "gpt-4o-mini"),
      advanced: modelId(env.AI_MODEL_ADVANCED, "gpt-5-nano"),
    },
    reasoningEffort: (env.AI_REASONING_EFFORT || "minimal").trim(),
    maxInputTokens: num("AI_MAX_INPUT_TOKENS", 1500),
    timeoutMs: num("AI_TIMEOUT_MS", 60_000),
    dailyBudgetUsd: num("AI_DAILY_BUDGET_USD", 50),
    // ⚠️ Fails CLOSED on an unset key: without a key there is nothing to call,
    // and reporting "enabled" would turn every AI surface into an error state
    // instead of the "unavailable" state P3 requires.
    enabled: (env.AI_ENABLED ?? "true") !== "false" && Boolean(env.AI_API_KEY),
    cacheTtlDays: num("AI_CACHE_TTL_DAYS", 7),
  };
}

/**
 * ROUGH TOKEN COUNT — deliberately not a tokenizer.
 *
 * ⚠️ A REAL BPE TOKENIZER IS THE WRONG DEPENDENCY HERE. It is provider-specific
 * (so it would leak a vendor assumption into provider-agnostic code, which is
 * the one thing §8.3 forbids), it is a megabyte of vocabulary loaded into the
 * worker, and it is precise about a number we only use to decide whether to
 * drop the ninth-best piece of evidence.
 *
 * ~3.6 characters per token is conservative for English prose with JSON
 * punctuation — it OVER-counts, so the budget trips early rather than late,
 * which is the safe direction for a cost control.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.6);
}
