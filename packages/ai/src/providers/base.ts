/**
 * PROVIDER BASE — PLAN.md Part VIII §8.3, §8.8, Phase 5 task 5.1.
 *
 * Turns a `CompletionProvider` (one method: `complete`) into a full
 * `AIProvider` (four typed feature methods). A new vendor writes ONE function
 * and inherits prompt selection, JSON-schema conversion, the repair path and
 * the validation pipeline unchanged.
 *
 * ⚠️ THIS IS WHAT MAKES §8.3's PORTABILITY CLAIM TRUE: "nothing outside
 * `packages/ai/src/providers/` imports the OpenAI SDK … the prompts, schemas,
 * validators, caching, metering, and grounding checks are all
 * provider-agnostic." If validation lived in the OpenAI adapter, a second
 * provider would arrive with a second, subtly different copy of the safety
 * boundary — which is the failure mode this whole layer exists to prevent.
 */

import { z } from "zod";
import { MAX_OUTPUT_TOKENS } from "../config";
import {
  groundingIdsOf,
  type ClientMessageContext,
  type DriftContext,
  type IssueContext,
} from "../context/index";
import { canonicalJson } from "../cache";
import { PROMPTS, REPAIR_SUFFIX, renderPrompt, type PromptFeature } from "../prompts/index";
import { OUTPUT_SCHEMAS, type OutputSchemaFeature } from "../schemas/index";
import {
  AIProviderError,
  ZERO_USAGE,
  type AIProvider,
  type AIResult,
  type CallOptions,
  type CompletionProvider,
} from "../types";
import { validateAIOutput, type ValidationFailure } from "../validate";

/**
 * Zod → JSON Schema for the provider's strict structured-output spec.
 *
 * `io: "input"` matters: we want the schema the model must PRODUCE, not the
 * post-transform output type. `target: "draft-7"` is the dialect providers
 * actually accept today.
 */
export function toJsonSchema(feature: OutputSchemaFeature): Record<string, unknown> {
  return z.toJSONSchema(OUTPUT_SCHEMAS[feature], {
    target: "draft-7",
    io: "input",
    // A provider rejects `$ref` cycles it cannot resolve; inlining is safe for
    // schemas this small and removes a class of vendor-specific breakage.
    reused: "inline",
  }) as Record<string, unknown>;
}

/** Fills the `{{placeholders}}` each feature's user prompt declares. */
function renderUserPrompt(
  feature: PromptFeature,
  context: IssueContext | DriftContext | ClientMessageContext,
): string {
  const contextJson = canonicalJson(context);

  switch (feature) {
    case "RECOMMEND_FIX": {
      const issue = context as IssueContext;
      return renderPrompt(PROMPTS.RECOMMEND_FIX.user, {
        contextJson,
        // "unknown" rather than an empty string: the prompt tells the model to
        // say which detail would narrow the answer down, and it can only do
        // that if it can tell the field is missing rather than blank.
        cms: issue.site.cms ?? "unknown",
        cmp: issue.site.cmp ?? "unknown",
      });
    }
    case "CLIENT_MESSAGE": {
      const message = context as ClientMessageContext;
      return renderPrompt(PROMPTS.CLIENT_MESSAGE.user, {
        contextJson,
        tone: message.tone,
        fixInProgress: String(message.fixInProgress),
      });
    }
    default:
      return renderPrompt(PROMPTS[feature].user, { contextJson });
  }
}

function failure<T>(
  code: AIResult<T>["errorCode"],
  message: string,
  partial?: Partial<AIResult<T>>,
): AIResult<T> {
  return {
    ok: false,
    errorCode: code,
    errorMessage: message,
    usage: partial?.usage ?? ZERO_USAGE,
    model: partial?.model ?? "unknown",
    latencyMs: partial?.latencyMs ?? 0,
  };
}

/**
 * One feature call: render → complete → validate → (repair once) → validate.
 *
 * ⚠️ THE REPAIR IS ATTEMPTED EXACTLY ONCE AND ONLY FOR A SCHEMA FAILURE
 * (§8.8). `failure.repairable` is set by the validator, not decided here, so
 * there is one place in the codebase that knows a grounding rejection must
 * never be retried — and it is the file that detects it.
 *
 * ⚠️ USAGE FROM A REJECTED RESPONSE IS STILL RETURNED. The provider charged us
 * for it. §8.9 is explicit that a failed call costs the customer 0 credits but
 * its provider cost is still logged for margin tracking, and that only works if
 * the numbers survive the rejection.
 */
export async function runFeature<T>(
  provider: CompletionProvider,
  feature: PromptFeature & OutputSchemaFeature,
  context: IssueContext | DriftContext | ClientMessageContext,
  options: CallOptions,
): Promise<AIResult<T>> {
  const prompt = PROMPTS[feature];
  const jsonSchema = toJsonSchema(feature);
  const groundingIds = groundingIdsOf(context);
  const user = renderUserPrompt(feature, context);

  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  let totalCostMicroCents = 0;
  let totalLatencyMs = 0;
  let model = "unknown";
  let lastFailure: ValidationFailure | null = null;

  // Attempt 0 = the call. Attempt 1 = the single repair, only if allowed.
  for (let attempt = 0; attempt < 2; attempt++) {
    const userMessage =
      attempt === 0
        ? user
        : user +
          renderPrompt(REPAIR_SUFFIX, {
            zodError: lastFailure?.detail ?? "schema mismatch",
          });

    let response;
    try {
      response = await provider.complete({
        feature,
        system: prompt.system,
        user: userMessage,
        schemaName: prompt.schemaName,
        jsonSchema,
        options,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      /*
       * ⚠️ THE CALL ENDS HERE EITHER WAY — this loop's second pass is the
       * schema REPAIR, not a transport retry, so re-entering it after a
       * transport error would send the repair prompt for a response that never
       * arrived. Transport retries belong to the BullMQ job above, which is
       * where the deterministic/transient split is acted on. `retryable` is
       * carried out on the error so the job can make that decision instead of
       * retrying a 401 eight times, which is exactly what `packages/email` had
       * to be taught after an unverified-domain 403 burned every attempt.
       */
      const retryable = error instanceof AIProviderError ? error.retryable : true;
      const result = failure<T>("PROVIDER_UNAVAILABLE", message, {
        usage: {
          promptTokens: totalPromptTokens,
          completionTokens: totalCompletionTokens,
          costMicroCents: totalCostMicroCents,
        },
        model,
        latencyMs: totalLatencyMs,
      });
      return { ...result, retryable };
    }

    totalPromptTokens += response.usage.promptTokens;
    totalCompletionTokens += response.usage.completionTokens;
    totalCostMicroCents += response.usage.costMicroCents;
    totalLatencyMs += response.latencyMs;
    model = response.model;

    const validated = validateAIOutput(feature, response.raw, { groundingIds });
    if (validated.ok) {
      return {
        ok: true,
        data: validated.data as T,
        usage: {
          promptTokens: totalPromptTokens,
          completionTokens: totalCompletionTokens,
          costMicroCents: totalCostMicroCents,
        },
        model,
        latencyMs: totalLatencyMs,
      };
    }

    lastFailure = validated.failure;
    if (!validated.failure.repairable) break;
  }

  return failure<T>(
    lastFailure?.errorCode ?? "VALIDATION_FAILED",
    lastFailure?.detail ?? "Output failed validation.",
    {
      usage: {
        promptTokens: totalPromptTokens,
        completionTokens: totalCompletionTokens,
        costMicroCents: totalCostMicroCents,
      },
      model,
      latencyMs: totalLatencyMs,
    },
  );
}

/** Wraps a `CompletionProvider` as the four-method `AIProvider` of §8.3. */
export function createProvider(completion: CompletionProvider): AIProvider {
  return {
    name: completion.name,
    explainIssue: (ctx, opts) =>
      runFeature(completion, "EXPLAIN_ISSUE", ctx, withDefaults("EXPLAIN_ISSUE", opts)),
    recommendFix: (ctx, opts) =>
      runFeature(completion, "RECOMMEND_FIX", ctx, withDefaults("RECOMMEND_FIX", opts)),
    summarizeDrift: (ctx, opts) =>
      runFeature(completion, "SUMMARIZE_DRIFT", ctx, withDefaults("SUMMARIZE_DRIFT", opts)),
    generateClientMessage: (ctx, opts) =>
      runFeature(completion, "CLIENT_MESSAGE", ctx, withDefaults("CLIENT_MESSAGE", opts)),
  };
}

/**
 * Clamps `maxOutputTokens` to the per-feature cap.
 *
 * ⚠️ CLAMPED, NOT DEFAULTED. §8.9's token caps "bound the worst case", and a
 * caller that passes a larger number — a copy-paste, a config typo, a future
 * route that forgot — must not be able to raise the ceiling from outside.
 */
function withDefaults(feature: PromptFeature, opts: CallOptions): CallOptions {
  return {
    ...opts,
    maxOutputTokens: Math.min(opts.maxOutputTokens, MAX_OUTPUT_TOKENS[feature]),
  };
}
