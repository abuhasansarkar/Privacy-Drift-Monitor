/**
 * AI LAYER TYPES — PLAN.md Part VIII §8.3, Phase 5 task 5.1.
 *
 * ⚠️ THE TWO GOVERNING PRINCIPLES (Part 0 §0.2 P1–P2, feature doc 16) are
 * encoded structurally in this file, not left to reviewer discipline:
 *
 *   P1 — AI is never the detector. Nothing here accepts raw scan output, a
 *        Playwright handle, or a page body. A provider is handed a *context*
 *        built from typed database fields and can therefore only describe
 *        facts the deterministic pipeline already recorded.
 *   P2 — AI explains evidence; AI never invents it. Every output type carries
 *        `evidence_refs` (or `events_referenced`) whose members must resolve
 *        to real primary keys, checked in `validate.ts` before anything is
 *        persisted or shown.
 *
 * Nothing outside `src/providers/` may import a vendor SDK. A provider swap is
 * one adapter plus `AI_PROVIDER` — the prompts, schemas, validators, cache,
 * metering and grounding checks are all provider-agnostic.
 */

import type {
  ClientMessage,
  DriftSummary,
  FixRecommendation,
  IssueExplanation,
} from "./schemas/index";
import type {
  ClientMessageContext,
  DriftContext,
  IssueContext,
} from "./context/index";

/**
 * The MVP feature set. Mirrors the Prisma `AIFeature` enum character for
 * character.
 *
 * ⚠️ RESTATED RATHER THAN IMPORTED, for the same reason `ScanJobData.trigger`
 * is: `packages/ai` must stay testable without a database, so it cannot depend
 * on the generated Prisma client. The value is cast at the persistence
 * boundary and a member that drifts from the schema fails there — which is why
 * it must match exactly. `ai-enums.test.ts` asserts the two agree.
 */
export const AI_FEATURES = [
  "EXPLAIN_ISSUE",
  "RECOMMEND_FIX",
  "SUMMARIZE_DRIFT",
  "CLIENT_MESSAGE",
  "CLASSIFY_TRACKER",
  "ROOT_CAUSE",
  "DEVELOPER_TASK",
  "WEBSITE_SUMMARY",
] as const;

export type AIFeature = (typeof AI_FEATURES)[number];

/** The four features that ship in the MVP (§8.5). The rest are V1.5/V2. */
export const MVP_AI_FEATURES = [
  "EXPLAIN_ISSUE",
  "RECOMMEND_FIX",
  "SUMMARIZE_DRIFT",
  "CLIENT_MESSAGE",
] as const satisfies readonly AIFeature[];

export type MvpAIFeature = (typeof MVP_AI_FEATURES)[number];

/** Mirrors the Prisma `AiModelTier` enum. §8.3 maps tier → model in config. */
export type ModelTier = "standard" | "advanced";

/**
 * Every way an AI call can fail, as a stable machine-readable code.
 *
 * ⚠️ These reach the UI, which picks a fallback per code — `QUOTA_EXCEEDED`
 * renders an upgrade prompt while `PROVIDER_UNAVAILABLE` renders "temporarily
 * unavailable". Renaming one is a UI change, so they are treated as a contract
 * the same way rule ids are.
 */
export type AIErrorCode =
  /** Zod parse failed twice (original + one repair attempt). §8.6 step 1. */
  | "VALIDATION_FAILED"
  /** An `evidence_refs` entry did not resolve. §8.6 step 2. NEVER repaired. */
  | "GROUNDING_FAILED"
  /** Output asserted a legal conclusion. §8.6 step 3. NEVER repaired. */
  | "TERMINOLOGY_REJECTED"
  /** Output claimed it had performed an action. §8.6 step 4. NEVER repaired. */
  | "CLAIM_REJECTED"
  /** The agency is out of monthly AI credits. Checked BEFORE the call. */
  | "QUOTA_EXCEEDED"
  /** The platform daily spend cap tripped. The backstop against a loop. */
  | "PLATFORM_BUDGET_EXCEEDED"
  /** `aiEnabled` off, the kill-switch flag off, or no API key configured. */
  | "AI_DISABLED"
  /** Provider returned an error, timed out, or the circuit breaker is open. */
  | "PROVIDER_UNAVAILABLE"
  /** The built context exceeded the input token budget and could not be cut. */
  | "CONTEXT_TOO_LARGE";

/** Per-call knobs. §8.3. */
export interface CallOptions {
  tier: ModelTier;
  maxOutputTokens: number;
  timeoutMs: number;
  /** Correlates the provider call with the `AIRequest` row and the log line. */
  traceId: string;
}

export interface AIUsage {
  promptTokens: number;
  completionTokens: number;
  /**
   * Micro-cents, integer. Money is never a float here: a fraction of a cent per
   * call summed over a month is exactly where rounding drift shows up in a
   * margin report.
   *
   * ⚠️ 1 micro-cent = 1e-6 CENTS = 1e-8 USD, so $1 = 100,000,000. This comment
   * previously read "1e-6 USD", which is a micro-DOLLAR — and that one wrong
   * word is what put `usdToMicroCents` 100× off the pricing table it was
   * compared against. Use `MICRO_CENTS_PER_USD` from `budget.ts`; never write
   * the conversion inline.
   */
  costMicroCents: number;
}

export const ZERO_USAGE: AIUsage = {
  promptTokens: 0,
  completionTokens: 0,
  costMicroCents: 0,
};

export interface AIResult<T> {
  ok: boolean;
  data?: T;
  errorCode?: AIErrorCode;
  errorMessage?: string;
  usage: AIUsage;
  model: string;
  latencyMs: number;
  /**
   * Set only on a transport failure, so the BullMQ job can tell a timeout from
   * a 401 and stop retrying the second one.
   *
   * ⚠️ ABSENT MEANS "NOT RETRYABLE". A validation rejection is a terminal
   * outcome — the model answered, we refused the answer, and asking again with
   * the same context is spending money to be refused identically.
   */
  retryable?: boolean;
}

/**
 * What a provider returns before validation: the raw parsed JSON plus usage.
 *
 * ⚠️ `raw` IS DELIBERATELY `unknown`. A provider may not pre-validate — the
 * single validation boundary is `validate.ts`, and a provider that returned a
 * typed value would be asserting a guarantee only that boundary can make.
 */
export interface ProviderResponse {
  raw: unknown;
  usage: AIUsage;
  model: string;
  latencyMs: number;
  /** Verbatim provider text, kept only for the repair prompt. */
  rawText?: string;
}

/**
 * One provider call. `schemaName` and `jsonSchema` let a provider request
 * strict structured output where it supports it (§8.3: OpenAI Responses API
 * with `strict: true`, so the model cannot return a shape our schema rejects).
 */
export interface ProviderRequest {
  feature: AIFeature;
  system: string;
  user: string;
  schemaName: string;
  jsonSchema: Record<string, unknown>;
  options: CallOptions;
}

/**
 * THE PROVIDER ABSTRACTION — §8.3.
 *
 * The four MVP methods are required. The two V1.5 methods are optional, so a
 * provider is not forced to stub features that are out of scope; callers check
 * for the method rather than catching a "not implemented" throw.
 */
export interface AIProvider {
  readonly name: string;
  explainIssue(
    ctx: IssueContext,
    opts: CallOptions,
  ): Promise<AIResult<IssueExplanation>>;
  recommendFix(
    ctx: IssueContext,
    opts: CallOptions,
  ): Promise<AIResult<FixRecommendation>>;
  summarizeDrift(
    ctx: DriftContext,
    opts: CallOptions,
  ): Promise<AIResult<DriftSummary>>;
  generateClientMessage(
    ctx: ClientMessageContext,
    opts: CallOptions,
  ): Promise<AIResult<ClientMessage>>;
}

/**
 * The low-level seam every provider implements. `AIProvider`'s four methods are
 * built on top of it in `providers/base.ts`, so a new provider writes ONE
 * function — `complete` — and inherits prompt selection, schema conversion,
 * the repair path and validation unchanged.
 */
export interface CompletionProvider {
  readonly name: string;
  complete(request: ProviderRequest): Promise<ProviderResponse>;
}

/** Provider errors that answer the same way on every attempt are not retried. */
export class AIProviderError extends Error {
  readonly retryable: boolean;
  readonly status?: number;

  constructor(message: string, opts: { retryable: boolean; status?: number }) {
    super(message);
    this.name = "AIProviderError";
    this.retryable = opts.retryable;
    this.status = opts.status;
  }
}
