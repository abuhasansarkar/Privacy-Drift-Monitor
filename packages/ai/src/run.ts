/**
 * AI ORCHESTRATOR — PLAN.md Part VIII §8.2's flowchart, Phase 5 tasks 5.5–5.6.
 *
 * ONE code path for every AI call, whatever triggered it:
 *
 *   cache hit? → budget check → dedupe lock → provider → validate → persist
 *
 * ⚠️ THE ORDER IS THE SPEC, NOT AN IMPLEMENTATION DETAIL. §8.2 draws it and
 * §12.3 tests it: "Exceeding the credit cap blocks the call **before** the
 * provider is contacted", "An identical second request is served from cache at
 * zero cost". Reordering the cache check after the budget check would charge
 * a customer for a free hit; reordering the budget check after the provider
 * call would make the cap a report.
 *
 * ⚠️ WHY THIS LIVES IN `packages/ai` AND TAKES PORTS RATHER THAN A PRISMA
 * CLIENT. Two callers need it — a Server Action on the issue page and the
 * BullMQ `ai` job — and they live in `src/` and `worker/`, which cannot import
 * each other. The alternative was one copy in each, and two copies of a
 * sequence whose ORDER is a safety property is how one of them quietly loses a
 * step. The ports also keep this package testable with no database, which is
 * the constraint `packages/scanner` already lives under.
 *
 * ⚠️ THIS FUNCTION NEVER THROWS FOR AN AI FAILURE. Every path returns an
 * outcome the UI can render, because P3 makes "no AI" a designed state rather
 * than an error: the deterministic content above the AI section was always
 * complete on its own.
 */

import { checkBudget, creditsFor, type AgencyAiState, type PlatformBudgetState } from "./budget";
import { computeInputHash, withDedupe, type DedupeStore } from "./cache";
import { loadAIConfig, FEATURE_TIER, MAX_OUTPUT_TOKENS, type AIConfig } from "./config";
import type {
  ClientMessageContext,
  DriftContext,
  IssueContext,
} from "./context/index";
import { PROMPTS, type PromptFeature } from "./prompts/index";
import type { OutputSchemaFeature } from "./schemas/index";
import { runFeature } from "./providers/base";
import type { AIErrorCode, AIProvider, CompletionProvider, ModelTier } from "./types";

export type RunnableFeature = PromptFeature & OutputSchemaFeature;

/** What the caller must supply. Each port is one narrow capability. */
export interface AIRunPorts {
  /** Returns a stored SUCCESS row for this hash inside the TTL, or null. */
  findCached(inputHash: string): Promise<{ id: string; output: unknown } | null>;
  /** Writes the `AIRequest` row — log, cache entry and ledger line in one. */
  record(row: RecordedCall): Promise<{ id: string }>;
  /** The agency's switches and credit position. */
  loadAgencyState(): Promise<AgencyAiState>;
  /** Today's platform spend against the daily cap. */
  loadPlatformState(): Promise<PlatformBudgetState>;
  /** Adds this call's provider cost to today's platform total. */
  addPlatformSpend(microCents: number): Promise<void>;
  /** Optional: without it, concurrent identical calls each pay (§8.9). */
  dedupe?: DedupeStore;
}

export interface RecordedCall {
  feature: RunnableFeature;
  provider: string;
  model: string;
  status: "SUCCESS" | "VALIDATION_FAILED" | "PROVIDER_ERROR" | "RATE_LIMITED" | "CACHED";
  promptVersion: string;
  inputHash: string;
  userId: string | null;
  entityType: string | null;
  entityId: string | null;
  issueId: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  costMicroCents: number | null;
  latencyMs: number | null;
  creditsCharged: number;
  output: unknown;
  validationErrors: unknown;
  errorCode: string | null;
  errorMessage: string | null;
  fromCache: boolean;
}

export interface AIRunInput {
  feature: RunnableFeature;
  context: IssueContext | DriftContext | ClientMessageContext;
  /** For the `AIRequest` row, so the output can be found again. */
  entityType: string;
  entityId: string;
  issueId?: string | null;
  userId?: string | null;
  traceId: string;
  /** Per-agency override from `AgencyAiSettings.modelTier`. */
  tierOverride?: ModelTier;
  /** Per-feature agency toggle from `AgencyAiSettings.featureToggles`. */
  featureEnabled?: boolean;
}

export type AIRunOutcome =
  | { ok: true; data: unknown; requestId: string; fromCache: boolean; creditsCharged: number }
  | { ok: false; errorCode: AIErrorCode; message: string; requestId: string | null };

export interface AIRunDeps {
  provider: AIProvider | CompletionProvider | null;
  ports: AIRunPorts;
  config?: AIConfig;
}

function isCompletionProvider(
  provider: AIProvider | CompletionProvider,
): provider is CompletionProvider {
  return "complete" in provider;
}

export async function runAI(
  input: AIRunInput,
  deps: AIRunDeps,
): Promise<AIRunOutcome> {
  const config = deps.config ?? loadAIConfig();
  const prompt = PROMPTS[input.feature];
  const inputHash = computeInputHash(input.feature, prompt.version, input.context);
  const tier = input.tierOverride ?? FEATURE_TIER[input.feature];

  // ── 1. Cache (§8.9) ─────────────────────────────────────────────────────
  //
  // ⚠️ FIRST, BEFORE EVERY OTHER CHECK INCLUDING THE BUDGET. A hit costs
  // nothing, so an agency at its credit cap must still be able to READ an
  // explanation somebody already paid for — blocking that would take away
  // content the customer has already bought.
  const cached = await deps.ports.findCached(inputHash);
  if (cached) {
    const row = await deps.ports.record({
      ...baseRow(input, inputHash, prompt.version),
      provider: config.provider,
      model: "cache",
      status: "CACHED",
      promptTokens: null,
      completionTokens: null,
      costMicroCents: 0,
      latencyMs: 0,
      creditsCharged: 0,
      output: cached.output,
      validationErrors: null,
      errorCode: null,
      errorMessage: null,
      fromCache: true,
    });
    return {
      ok: true,
      data: cached.output,
      requestId: row.id,
      fromCache: true,
      creditsCharged: 0,
    };
  }

  // ── 2. Budget (§8.9) — BEFORE the provider is contacted ─────────────────
  const [agency, platform] = await Promise.all([
    deps.ports.loadAgencyState(),
    deps.ports.loadPlatformState(),
  ]);

  const decision = checkBudget({
    agency,
    platform,
    tier,
    globallyEnabled: config.enabled && deps.provider !== null,
    featureEnabled: input.featureEnabled,
  });

  if (!decision.allowed) {
    /*
     * ⚠️ A BLOCKED CALL IS STILL LOGGED, and logged as RATE_LIMITED rather than
     * dropped silently. §8.6 surfaces per-feature failure rates in
     * /admin/ai-usage; an agency hitting its cap forty times a day is a sales
     * signal and a support signal, and it is invisible if the block leaves no
     * row. It costs 0 credits and 0 provider spend — the whole point.
     */
    const row = await deps.ports.record({
      ...baseRow(input, inputHash, prompt.version),
      provider: config.provider,
      model: "none",
      status: "RATE_LIMITED",
      promptTokens: null,
      completionTokens: null,
      costMicroCents: 0,
      latencyMs: 0,
      creditsCharged: 0,
      output: null,
      validationErrors: null,
      errorCode: decision.errorCode,
      errorMessage: decision.detail,
      fromCache: false,
    });
    return {
      ok: false,
      errorCode: decision.errorCode,
      message: decision.detail,
      requestId: row.id,
    };
  }

  if (!deps.provider) {
    return {
      ok: false,
      errorCode: "AI_DISABLED",
      message: "No AI provider is configured.",
      requestId: null,
    };
  }

  const provider = deps.provider;

  // ── 3–5. Dedupe → provider → validate ───────────────────────────────────
  const call = async () => {
    const options = {
      tier,
      maxOutputTokens: MAX_OUTPUT_TOKENS[input.feature],
      timeoutMs: config.timeoutMs,
      traceId: input.traceId,
    };

    if (isCompletionProvider(provider)) {
      return runFeature<unknown>(provider, input.feature, input.context, options);
    }
    switch (input.feature) {
      case "EXPLAIN_ISSUE":
        return provider.explainIssue(input.context as IssueContext, options);
      case "RECOMMEND_FIX":
        return provider.recommendFix(input.context as IssueContext, options);
      case "SUMMARIZE_DRIFT":
        return provider.summarizeDrift(input.context as DriftContext, options);
      case "CLIENT_MESSAGE":
        return provider.generateClientMessage(
          input.context as ClientMessageContext,
          options,
        );
    }
  };

  const outcome = deps.ports.dedupe
    ? await withDedupe(deps.ports.dedupe, inputHash, call)
    : { source: "self" as const, value: await call() };

  const result = outcome.value;

  /*
   * ⚠️ THE PROVIDER COST IS RECORDED EVEN WHEN THE OUTPUT IS REJECTED. §8.9:
   * "Failed calls cost 0 [credits] (we do not charge the customer for our
   * failure, though the provider cost is still logged for our own margin
   * tracking)." The platform daily cap therefore counts rejected calls too —
   * a prompt regression that fails validation on every attempt is exactly the
   * runaway the cap exists to stop, and it would be invisible to a cap that
   * only counted successes.
   *
   * A `waited` result made no call of its own; adding its shared cost again
   * would double-count the winner's spend.
   */
  if (outcome.source !== "waited" && result.usage.costMicroCents > 0) {
    await deps.ports.addPlatformSpend(result.usage.costMicroCents);
  }

  const creditsCharged = creditsFor(tier, {
    fromCache: outcome.source === "waited",
    succeeded: result.ok,
  });

  const row = await deps.ports.record({
    ...baseRow(input, inputHash, prompt.version),
    provider: provider.name,
    model: result.model,
    status: result.ok ? "SUCCESS" : statusFor(result.errorCode),
    promptTokens: result.usage.promptTokens,
    completionTokens: result.usage.completionTokens,
    costMicroCents: result.usage.costMicroCents,
    latencyMs: result.latencyMs,
    creditsCharged,
    output: result.ok ? result.data : null,
    validationErrors: result.ok
      ? null
      : { errorCode: result.errorCode, detail: result.errorMessage },
    errorCode: result.errorCode ?? null,
    errorMessage: result.errorMessage ?? null,
    // A `waited` result was produced by another caller's provider call, so it
    // is a cache hit in every sense that matters for billing and for the label.
    fromCache: outcome.source === "waited",
  });

  if (!result.ok) {
    return {
      ok: false,
      errorCode: result.errorCode ?? "VALIDATION_FAILED",
      message: result.errorMessage ?? "The AI response failed validation.",
      requestId: row.id,
    };
  }

  return {
    ok: true,
    data: result.data,
    requestId: row.id,
    fromCache: outcome.source === "waited",
    creditsCharged,
  };
}

function baseRow(
  input: AIRunInput,
  inputHash: string,
  promptVersion: string,
): Pick<
  RecordedCall,
  "feature" | "promptVersion" | "inputHash" | "userId" | "entityType" | "entityId" | "issueId"
> {
  return {
    feature: input.feature,
    promptVersion,
    inputHash,
    userId: input.userId ?? null,
    entityType: input.entityType,
    entityId: input.entityId,
    issueId: input.issueId ?? null,
  };
}

/** Maps our error codes onto the `AIRequestStatus` enum §5 already fixed. */
function statusFor(code: AIErrorCode | undefined): RecordedCall["status"] {
  switch (code) {
    case "PROVIDER_UNAVAILABLE":
      return "PROVIDER_ERROR";
    case "QUOTA_EXCEEDED":
    case "PLATFORM_BUDGET_EXCEEDED":
    case "AI_DISABLED":
      return "RATE_LIMITED";
    default:
      // Grounding, terminology, claim and shape rejections are all validation
      // outcomes: the model answered and we refused the answer.
      return "VALIDATION_FAILED";
  }
}
