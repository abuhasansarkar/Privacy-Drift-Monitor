/**
 * `@pdm/ai` — PLAN.md Part VIII, Phase 5.
 *
 * A provider-agnostic layer that EXPLAINS verified evidence. It is additive by
 * construction: nothing in the product depends on it (feature doc 16,
 * "Dependencies … Nothing depends on this — by design"), and with the provider
 * unreachable, scanning, detection, drift, scoring, alerts and reports all
 * continue untouched.
 *
 * ⚠️ EXPLICIT RE-EXPORTS, NOT `export *`. A `.ts` barrel using `export *` is
 * invisible to Node's ESM loader under tsx — the worker died at boot on a
 * symbol that demonstrably existed (AGENTS.md, defect 2). `worker/` consumes
 * this barrel, so every symbol is named.
 */

export type {
  AIConfidence,
  ClientMessage,
  ClientSummary,
  DriftSummary,
  FixRecommendation,
  IssueExplanation,
  OutputSchemaFeature,
  TrackerClassification,
} from "./schemas/index";
export {
  GROUNDING_FIELD,
  OUTPUT_SCHEMAS,
  clientMessageSchema,
  clientSummarySchema,
  confidenceSchema,
  driftSummarySchema,
  evidenceRefsSchema,
  fixRecommendationSchema,
  issueExplanationSchema,
  trackerClassificationSchema,
} from "./schemas/index";

export type {
  AIErrorCode,
  AIFeature,
  AIProvider,
  AIResult,
  AIUsage,
  CallOptions,
  CompletionProvider,
  ModelTier,
  MvpAIFeature,
  ProviderRequest,
  ProviderResponse,
} from "./types";
export { AIProviderError, AI_FEATURES, MVP_AI_FEATURES, ZERO_USAGE } from "./types";

export type {
  BuildClientMessageContextInput,
  BuildDriftContextInput,
  BuildIssueContextInput,
  ClientMessageContext,
  ConsentPhaseName,
  DriftContext,
  EvidenceContextItem,
  EvidenceKindName,
  IssueContext,
  RawEvidenceRow,
  RawIssueRow,
  SeverityName,
} from "./context/index";
export {
  MAX_DRIFT_EVENTS,
  MAX_EVIDENCE_ITEMS,
  MAX_MESSAGE_ISSUES,
  buildClientMessageContext,
  buildDriftContext,
  buildIssueContext,
  groundingIdsOf,
  redactUrl,
  sanitize,
  selectEvidence,
  summariseEvidence,
} from "./context/index";

export type { PromptFeature, PromptTemplate } from "./prompts/index";
export { PROMPTS, SYSTEM_PREAMBLE_V1, renderPrompt } from "./prompts/index";

export type { PolicyExtractOutput } from "./prompts/policy-extract";
export {
  POLICY_EXTRACT_V1,
  PolicyExtractOutputSchema,
  filterGroundedVendors,
  extractPolicyVendorsHeuristic,
  extractEffectiveDate,
} from "./prompts/policy-extract";

export type { CookieClassifyOutput } from "./prompts/cookie-classify";
export {
  COOKIE_CLASSIFY_V1,
  COOKIE_CLASSIFY_USER_V1,
  CookieClassifyOutputSchema,
} from "./prompts/cookie-classify";

export type {
  CookieClassificationInput,
  CookieClassifierDeps,
} from "./cookie-classifier";
export {
  classifyCookie,
  getCookieCacheKey,
  clearCookieClassificationCache,
} from "./cookie-classifier";

export type {
  ValidationFailure,
  ValidationResult,
  ValidationStage,
} from "./validate";
export { summariseZodError, validateAIOutput } from "./validate";

export type { AIConfig } from "./config";
export {
  CREDITS_PER_TIER,
  FEATURE_TIER,
  MAX_OUTPUT_TOKENS,
  estimateTokens,
  loadAIConfig,
} from "./config";

export type {
  AgencyAiState,
  BudgetDecision,
  PlatformBudgetState,
  TierPricing,
} from "./budget";
export {
  CREDIT_WARN_THRESHOLD,
  DEFAULT_PRICING,
  checkBudget,
  creditsFor,
  estimateCostMicroCents,
  microCentsToUsd,
  platformSpendKey,
  usdToMicroCents,
} from "./budget";

export type { DedupeOptions, DedupeOutcome, DedupeStore } from "./cache";
export {
  canonicalJson,
  computeInputHash,
  dedupeLockKey,
  dedupeResultKey,
  withDedupe,
} from "./cache";

export { createProvider, runFeature, toJsonSchema } from "./providers/base";

export type {
  AIRunDeps,
  AIRunInput,
  AIRunOutcome,
  AIRunPorts,
  RecordedCall,
  RunnableFeature,
} from "./run";
export { runAI } from "./run";
export { MockProvider } from "./providers/mock";
export type { MockBehaviour, MockProviderOptions } from "./providers/mock";
export { OpenAIProvider } from "./providers/openai";

import { loadAIConfig, type AIConfig } from "./config";
import { createProvider } from "./providers/base";
import { MockProvider } from "./providers/mock";
import { OpenAIProvider } from "./providers/openai";
import type { AIProvider } from "./types";

/**
 * Selects the provider from configuration (§8.3: "A new provider implements the
 * interface and is selected by `AI_PROVIDER`").
 *
 * ⚠️ RETURNS `null` RATHER THAN THROWING when AI is off or unconfigured. Every
 * caller must already handle the unavailable case — P3 makes that path a
 * first-class product state, not an error — so a null here flows into the same
 * "AI explanations are temporarily unavailable" rendering as an outage, instead
 * of turning a missing env var into a 500 on the issue page.
 */
export function resolveProvider(config: AIConfig = loadAIConfig()): AIProvider | null {
  if (!config.enabled) return null;

  switch (config.provider) {
    case "mock":
      return createProvider(new MockProvider());
    case "openai":
      if (!config.apiKey) return null;
      return createProvider(
        new OpenAIProvider({
          apiKey: config.apiKey,
          baseUrl: config.baseUrl,
          models: config.models,
          reasoningEffort: config.reasoningEffort,
        }),
      );
    default:
      return null;
  }
}
