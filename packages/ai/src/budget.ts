/**
 * BUDGET ENFORCEMENT — PLAN.md Part VIII §8.9, Phase 5 task 5.5.
 *
 * ⚠️ THE ACCEPTANCE CRITERION IS "BEFORE", NOT "AFTER" (§12.3, dev-doc phase 5):
 * "Exceeding the credit cap blocks the call **before** the provider is
 * contacted." A cap checked after the response has arrived is a report, not a
 * cap — the money is already spent and the only thing it can still do is
 * withhold the output the customer just paid for.
 *
 * Three ceilings, narrowest first:
 *
 *   1. Agency `aiEnabled` / feature toggle  — the customer's own switch
 *   2. Per-agency monthly credit cap        — the tenant ceiling (§9.3 AI_CREDITS)
 *   3. Platform daily spend cap             — the backstop against a runaway loop
 *
 * §8.9's credit accounting, which the caller must honour:
 *   1 credit  = one successful standard-tier call
 *   3 credits = one successful advanced-tier call
 *   0 credits = a cache hit
 *   0 credits = a FAILED call — "we do not charge the customer for our failure,
 *               though the provider cost is still logged for our own margin
 *               tracking". Those two halves are different numbers and must not
 *               be conflated: `creditsFor()` bills the tenant, `costMicroCents`
 *               tracks our spend, and a validation rejection increments only
 *               the second.
 */

import { CREDITS_PER_TIER } from "./config";
import type { AIErrorCode, ModelTier } from "./types";

/** §8.9 — cached responses and failures cost the customer nothing. */
export function creditsFor(tier: ModelTier, outcome: {
  fromCache: boolean;
  succeeded: boolean;
}): number {
  if (outcome.fromCache || !outcome.succeeded) return 0;
  return CREDITS_PER_TIER[tier];
}

export interface AgencyAiState {
  /** `AgencyAiSettings.aiEnabled`. */
  aiEnabled: boolean;
  /** `AgencyAiSettings.monthlyCreditCap`, or null for "no cap configured". */
  monthlyCreditCap: number | null;
  /** Credits already consumed in the current billing period. */
  creditsUsedThisPeriod: number;
}

export interface PlatformBudgetState {
  /** Spend so far today, micro-cents. */
  spentMicroCentsToday: number;
  /** `AI_DAILY_BUDGET_USD`, converted. */
  dailyBudgetMicroCents: number;
}

export type BudgetDecision =
  | { allowed: true; remainingCredits: number | null; warn: boolean }
  | { allowed: false; errorCode: AIErrorCode; detail: string };

/** §8.9: "At 80% we notify; at 100% AI features show an upgrade prompt." */
export const CREDIT_WARN_THRESHOLD = 0.8;

/**
 * The single gate every AI call passes through before a provider is touched.
 *
 * ⚠️ ORDER MATTERS AND IS CHEAPEST-FIRST BY DESIGN. The two switches are free
 * boolean reads; the credit check needs a usage row; the platform check needs a
 * Redis read. During an incident — the case the platform cap exists for — the
 * cheap checks are the ones being hammered.
 *
 * ⚠️ NULL IS NOT UNLIMITED IN WHAT WE *SHOW*. `remainingCredits: null` means
 * "no cap configured" (billing lands in Phase 6), and every caller must render
 * that as *unknown* rather than drawing a meter against a made-up denominator —
 * the same rule `src/server/entitlements.ts` already states for website limits.
 * It does mean unlimited for what we ALLOW, which is a deliberate, reviewed gap
 * that closes when Phase 6 populates the cap.
 */
export function checkBudget(input: {
  agency: AgencyAiState;
  platform: PlatformBudgetState;
  tier: ModelTier;
  /** Global `AI_ENABLED` plus the API key being present. */
  globallyEnabled: boolean;
  /** Per-feature agency toggle from `AgencyAiSettings.featureToggles`. */
  featureEnabled?: boolean;
}): BudgetDecision {
  if (!input.globallyEnabled) {
    return {
      allowed: false,
      errorCode: "AI_DISABLED",
      detail: "AI is disabled platform-wide or no provider key is configured.",
    };
  }
  if (!input.agency.aiEnabled) {
    return {
      allowed: false,
      errorCode: "AI_DISABLED",
      detail: "This agency has turned AI features off.",
    };
  }
  if (input.featureEnabled === false) {
    return {
      allowed: false,
      errorCode: "AI_DISABLED",
      detail: "This AI feature is turned off for this agency.",
    };
  }

  const cost = CREDITS_PER_TIER[input.tier];
  const cap = input.agency.monthlyCreditCap;
  let remainingCredits: number | null = null;
  let warn = false;

  if (cap !== null) {
    remainingCredits = Math.max(0, cap - input.agency.creditsUsedThisPeriod);
    // ⚠️ `< cost`, not `<= 0`. An advanced call costs 3 credits, so an agency
    // with 2 left must be blocked rather than allowed to go 1 over — a cap that
    // can be exceeded by the price of one call is not a cap.
    if (remainingCredits < cost) {
      return {
        allowed: false,
        errorCode: "QUOTA_EXCEEDED",
        detail:
          `This agency has used ${input.agency.creditsUsedThisPeriod} of ` +
          `${cap} monthly AI credits.`,
      };
    }
    warn = input.agency.creditsUsedThisPeriod / cap >= CREDIT_WARN_THRESHOLD;
  }

  // ⚠️ THE BACKSTOP, CHECKED LAST AND HONOURED ABSOLUTELY. §8.9: "Exceeding it
  // disables non-critical AI platform-wide and pages the operator — this is the
  // backstop against a runaway loop." It is deliberately below the tenant cap in
  // this order because it is the most expensive read and the least often hit.
  if (input.platform.spentMicroCentsToday >= input.platform.dailyBudgetMicroCents) {
    return {
      allowed: false,
      errorCode: "PLATFORM_BUDGET_EXCEEDED",
      detail: "The platform daily AI budget has been reached.",
    };
  }

  return { allowed: true, remainingCredits, warn };
}

/**
 * ⚠️ ONE MICRO-CENT IS 1e-6 CENTS, WHICH IS 1e-8 USD. So $1 = 100,000,000 of
 * them. Spelling the constant out once, here, is the whole defence — see below
 * for what happened when it was not.
 */
export const MICRO_CENTS_PER_USD = 100_000_000;

/**
 * ⚠️ THIS PAIR WAS 100× WRONG AND EVERY TEST PASSED.
 *
 * They were `usd * 100 * 10_000` and `microCents / 1_000_000` — a micro-DOLLAR
 * scale, not a micro-cent one. Being wrong by the same factor in both
 * directions made them exact inverses, so a round-trip test round-tripped
 * perfectly and told us nothing. `DEFAULT_PRICING` meanwhile used true
 * micro-cents, so the two scales were silently a factor of 100 apart.
 *
 * The consequence was not a rounding error. `AI_DAILY_BUDGET_USD=50` produced a
 * cap of 50,000,000 units while a real `gpt-4o-mini` call costs ~26,460 of
 * them — so the PLATFORM KILL SWITCH would have fired after about 1,889 calls
 * and roughly **fifty cents** of actual spend, disabling AI for every tenant
 * and paging the operator. §8.9 calls this cap "the backstop against a runaway
 * loop"; at 1/100th of its configured value it is a runaway loop of its own.
 *
 * It was invisible until a real provider call put a real cost beside a real
 * budget. That is the whole argument for exercising the dependency.
 *
 * The test below anchors to an ABSOLUTE known value for exactly this reason: a
 * round-trip assertion cannot catch a pair that is consistently wrong.
 */
export function usdToMicroCents(usd: number): number {
  return Math.round(usd * MICRO_CENTS_PER_USD);
}

export function microCentsToUsd(microCents: number): number {
  return microCents / MICRO_CENTS_PER_USD;
}

/**
 * Per-1M-token prices, micro-cents, keyed by tier.
 *
 * ⚠️ THESE ARE FOR *OUR* MARGIN TRACKING AND THE PLATFORM DAILY CAP — never to
 * bill a customer, who is billed in credits (§8.9). A price that drifts from
 * the provider's real one misreports a dashboard and can trip the daily kill
 * switch at the wrong moment; it cannot overcharge anybody.
 *
 * ⚠️ THE VALUES BELOW MATCH THE CONFIGURED MODELS AND WERE READ FROM OPENAI'S
 * PUBLISHED PRICING, not assumed:
 *
 *     gpt-4o-mini (standard)  $0.15 in / $0.60 out per 1M
 *     gpt-5-nano  (advanced)  $0.05 in / $0.40 out per 1M
 *
 * CHANGE THEM WHENEVER `AI_MODEL_STANDARD` / `AI_MODEL_ADVANCED` CHANGE. They
 * are keyed by TIER, not by model id, so a model swap silently re-prices every
 * historical estimate against the wrong number if this table is not updated
 * with it.
 *
 * ⚠️ THE CONFIGURED TIERS ARE INVERTED ON COST, AND THAT IS DELIBERATE TO
 * SURFACE RATHER THAN SILENTLY "FIX". `gpt-5-nano` is the CHEAPEST GPT-5 tier —
 * 3× cheaper on input and 1.5× cheaper on output than `gpt-4o-mini` — yet §8.9
 * charges 3 credits for an advanced call and 1 for a standard one. A customer
 * therefore pays 3× for a call that costs us ~⅓ as much.
 *
 * This has NO effect today: `FEATURE_TIER` maps only `CLASSIFY_TRACKER` and
 * `ROOT_CAUSE` to `advanced`, and both are V1.5 (§8.5), so nothing in the MVP
 * reaches the advanced tier at all. It must be resolved before either ships —
 * either by pointing `AI_MODEL_ADVANCED` at a genuinely larger model (which is
 * what §8.3's "multi-step reasoning over more context" describes), or by
 * revisiting §8.9's 3-credit ratio. Changing the plan's credit accounting is
 * not a decision this file should make on its own.
 */
export interface TierPricing {
  inputMicroCentsPerMillion: number;
  outputMicroCentsPerMillion: number;
}

export const DEFAULT_PRICING: Record<ModelTier, TierPricing> = {
  // gpt-4o-mini — $0.15 in / $0.60 out per 1M tokens.
  standard: {
    inputMicroCentsPerMillion: 15_000_000,
    outputMicroCentsPerMillion: 60_000_000,
  },
  // gpt-5-nano — $0.05 in / $0.40 out per 1M tokens.
  //
  // ⚠️ Reasoning tokens are billed as OUTPUT tokens and are included in
  // `usage.output_tokens`, so this rate already covers them. That is why
  // `AI_REASONING_EFFORT=minimal` is a cost control and not only a token-budget
  // one — hidden tokens are charged at the visible output rate.
  advanced: {
    inputMicroCentsPerMillion: 5_000_000,
    outputMicroCentsPerMillion: 40_000_000,
  },
};

export function estimateCostMicroCents(
  tier: ModelTier,
  usage: { promptTokens: number; completionTokens: number },
  pricing: Record<ModelTier, TierPricing> = DEFAULT_PRICING,
): number {
  const price = pricing[tier];
  return Math.round(
    (usage.promptTokens * price.inputMicroCentsPerMillion) / 1_000_000 +
      (usage.completionTokens * price.outputMicroCentsPerMillion) / 1_000_000,
  );
}

/** The Redis key holding today's platform spend. Dated, so it expires itself. */
export function platformSpendKey(date: Date): string {
  return `pdm-ai-spend-${date.toISOString().slice(0, 10)}`;
}
