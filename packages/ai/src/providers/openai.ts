/**
 * OPENAI PROVIDER — PLAN.md Part VIII §8.3, Phase 5 task 5.1.
 *
 * §8.3: "using the Responses API with strict JSON-schema structured outputs
 * (`strict: true`), so the model cannot return a shape our schema rejects."
 *
 * ⚠️ THIS IS THE ONLY FILE IN THE REPO THAT KNOWS ABOUT OPENAI. §8.3 requires
 * that "nothing outside `packages/ai/src/providers/` imports the OpenAI SDK",
 * and this implements the one-method `CompletionProvider` seam so a second
 * vendor is one sibling file plus an `AI_PROVIDER` value — no change to the
 * prompts, schemas, validators, cache, metering or grounding checks.
 *
 * ⚠️ NO SDK DEPENDENCY. This calls the HTTP endpoint with `fetch`. The SDK
 * would add a large transitive tree to a worker that already carries Chromium,
 * and its retry/timeout behaviour would sit *underneath* our circuit breaker
 * and budget checks — silently multiplying the calls those controls exist to
 * bound. One `fetch` we can see is worth more here than a client we cannot.
 *
 * ⚠️ `strict: true` IS THE PROVIDER'S PROMISE, NOT OURS. Everything it returns
 * is still re-validated by `validate.ts`; a proxy, a cached edge response or a
 * future model can all break it, and grounding and terminology were never
 * expressible in a JSON schema in the first place.
 */

import { estimateCostMicroCents, type TierPricing } from "../budget";
import type { ModelTier } from "../types";
import {
  AIProviderError,
  type CompletionProvider,
  type ProviderRequest,
  type ProviderResponse,
} from "../types";

export interface OpenAIProviderOptions {
  apiKey: string;
  baseUrl?: string | null;
  models: Record<ModelTier, string>;
  pricing?: Record<ModelTier, TierPricing>;
  /** Sent ONLY to models that support it — see `isReasoningModel`. */
  reasoningEffort?: string;
  /** Injected in tests; defaults to global `fetch`. */
  fetchImpl?: typeof fetch;
}

/**
 * HTTP statuses that answer identically on every attempt.
 *
 * ⚠️ THE LESSON FROM `packages/email`: a permanent 403 from an unverified
 * domain was retried eight times before `EmailRejectedError` split
 * deterministic rejections from transient ones. A bad API key, a malformed
 * schema and a content-filter refusal are all in that category — retrying them
 * spends the budget to receive the same sentence.
 *
 * 429 is deliberately NOT here: rate limiting is the definition of transient.
 */
const PERMANENT_STATUSES = new Set([400, 401, 403, 404, 422]);

/**
 * Models that spend reasoning tokens and accept `reasoning.effort`.
 *
 * ⚠️ SENDING THIS PARAMETER TO A MODEL THAT DOES NOT SUPPORT IT IS A PERMANENT
 * 400, and it is never retried. Verified against the live API:
 *
 *   gpt-4o-mini + reasoning:{effort:"minimal"}
 *     → 400 unsupported_parameter: 'reasoning.effort' is not supported with this model.
 *   gpt-4o-mini plain            → 200, reasoning_tokens=0
 *   gpt-5-nano  + effort minimal → 200, reasoning_tokens=0
 *
 * So the parameter cannot simply always be sent, and it cannot simply never be
 * sent either: the same probe showed `gpt-5-nano` at our 400-token cap burning
 * **256 tokens on reasoning** with the default effort, leaving too little for
 * the schema. Both directions fail, which is why this predicate exists.
 *
 * ⚠️ IT FAILS TOWARD *NOT* SENDING. An unrecognised model id is treated as a
 * non-reasoning model, so a future id we have not seen degrades to "reasoning
 * costs more tokens than we would like" rather than to "this tier is
 * permanently 400". The first is a bill; the second is an outage.
 */
const REASONING_MODEL = /^(o\d|gpt-5)/i;

export function isReasoningModel(model: string): boolean {
  return REASONING_MODEL.test(model.trim());
}

export class OpenAIProvider implements CompletionProvider {
  readonly name = "openai";

  private readonly options: OpenAIProviderOptions;
  private readonly fetchImpl: typeof fetch;

  constructor(options: OpenAIProviderOptions) {
    this.options = options;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async complete(request: ProviderRequest): Promise<ProviderResponse> {
    const model = this.options.models[request.options.tier];
    const url = `${this.options.baseUrl ?? "https://api.openai.com/v1"}/responses`;
    const startedAt = Date.now();

    /*
     * ⚠️ THE TIMEOUT IS AN ABORT, NOT A RACE. `Promise.race` against a timer
     * leaves the request in flight — the socket stays open, the tokens are
     * still generated, and we are still billed for a response nobody reads.
     * The `finally` clears the timer so a fast response does not hold the
     * process alive for the full 60 s, which is how a worker ends up refusing
     * to exit on SIGTERM.
     */
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), request.options.timeoutMs);

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.options.apiKey}`,
        },
        body: JSON.stringify({
          model,
          instructions: request.system,
          input: request.user,
          max_output_tokens: request.options.maxOutputTokens,
          text: {
            format: {
              type: "json_schema",
              name: request.schemaName,
              strict: true,
              schema: withStrictDefaults(request.jsonSchema),
            },
          },
          /*
           * ⚠️ CONDITIONAL. See `isReasoningModel` — always-on is a permanent
           * 400 on gpt-4o-mini, always-off wastes most of the token cap on
           * gpt-5-nano.
           */
          ...(isReasoningModel(model) && this.options.reasoningEffort
            ? { reasoning: { effort: this.options.reasoningEffort } }
            : {}),
          metadata: { trace_id: request.options.traceId, feature: request.feature },
        }),
      });
    } catch (error) {
      const aborted = error instanceof Error && error.name === "AbortError";
      throw new AIProviderError(
        aborted
          ? `Provider timed out after ${request.options.timeoutMs}ms`
          : `Provider request failed: ${error instanceof Error ? error.message : String(error)}`,
        { retryable: true },
      );
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new AIProviderError(
        `Provider returned ${response.status}: ${body.slice(0, 300)}`,
        { retryable: !PERMANENT_STATUSES.has(response.status), status: response.status },
      );
    }

    const payload = (await response.json()) as OpenAIResponsePayload;

    /*
     * ⚠️ AN `incomplete` RESPONSE IS A 200 THAT PRODUCED NOTHING, AND IT IS NOT
     * RETRYABLE. When the token allowance runs out the API returns HTTP 200
     * with `status: "incomplete"` and `incomplete_details.reason:
     * "max_output_tokens"` — and on a reasoning model that can happen "before
     * any visible output tokens are produced", so we are billed for input plus
     * reasoning and receive no answer.
     *
     * Retrying is the wrong move: the same context and the same cap produce the
     * same outcome, so a retry is a second identical bill. This is the
     * `packages/email` lesson (a permanent 403 retried eight times) arriving in
     * a 200 response body instead of a status code — which is exactly why it
     * needs its own check rather than falling through to the generic
     * "no output text" branch below.
     */
    if (
      payload.status === "incomplete" &&
      payload.incomplete_details?.reason === "max_output_tokens"
    ) {
      const reasoningTokens =
        payload.usage?.output_tokens_details?.reasoning_tokens ?? 0;
      throw new AIProviderError(
        `Provider hit max_output_tokens (${request.options.maxOutputTokens}) ` +
          `before completing the answer` +
          (reasoningTokens > 0
            ? `; ${reasoningTokens} of them went on reasoning — lower AI_REASONING_EFFORT or raise the cap`
            : ""),
        { retryable: false },
      );
    }

    const text = extractOutputText(payload);
    if (text === null) {
      // A refusal, or a shape we do not recognise. Retryable: unlike the cap
      // above, a differently-phrased attempt genuinely can succeed.
      throw new AIProviderError("Provider returned no output text", {
        retryable: true,
      });
    }

    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      /*
       * ⚠️ NOT AN ERROR — a VALIDATION failure. Returning the unparsed text as
       * `raw` lets `validate.ts` reject it at stage 1, which is repairable, so
       * the model gets its one corrective attempt. Throwing here would classify
       * a fixable formatting slip as a provider outage and skip the repair path
       * §8.8 specifies for exactly this case.
       */
      raw = text;
    }

    const promptTokens = payload.usage?.input_tokens ?? 0;
    const completionTokens = payload.usage?.output_tokens ?? 0;

    return {
      raw,
      rawText: text,
      usage: {
        promptTokens,
        completionTokens,
        costMicroCents: estimateCostMicroCents(
          request.options.tier,
          { promptTokens, completionTokens },
          this.options.pricing,
        ),
      },
      model: payload.model ?? model,
      latencyMs: Date.now() - startedAt,
    };
  }
}

interface OpenAIResponsePayload {
  model?: string;
  status?: string;
  incomplete_details?: { reason?: string } | null;
  /**
   * ⚠️ NOT PRESENT ON THE WIRE. Verified by dumping a real 200: the raw HTTP
   * response has no `output_text` key at all — it is a convenience property the
   * official SDK derives, and we do not use the SDK. Kept in the type and read
   * first only so that a future API version or a proxy that DOES flatten it
   * works without a change; `output[].content[].text` is the real path and the
   * one every current call takes.
   */
  output_text?: string;
  output?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string }>;
  }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    /** Reasoning tokens are billed as output and counted against the cap. */
    output_tokens_details?: { reasoning_tokens?: number };
  };
}

/**
 * Pulls the JSON string out of a Responses-API payload.
 *
 * Two shapes are handled because the convenience field is not guaranteed:
 * `output_text` when the API flattens it, and the `output[].content[]` walk
 * otherwise. Reasoning items in `output` carry no `text`, so they are skipped
 * rather than concatenated as an empty string.
 */
function extractOutputText(payload: OpenAIResponsePayload): string | null {
  if (typeof payload.output_text === "string" && payload.output_text.length > 0) {
    return payload.output_text;
  }
  const parts: string[] = [];
  for (const item of payload.output ?? []) {
    for (const content of item.content ?? []) {
      if (typeof content.text === "string") parts.push(content.text);
    }
  }
  return parts.length > 0 ? parts.join("") : null;
}

/**
 * OpenAI's strict mode requires `additionalProperties: false` and every
 * property listed in `required` on every object — including nested ones.
 *
 * ⚠️ THIS IS NOT COSMETIC. Without it the API rejects the request outright with
 * a 400, which `PERMANENT_STATUSES` correctly refuses to retry — so a schema
 * missing one nested `additionalProperties` presents as "AI is permanently
 * broken for this feature", not as a schema bug. Zod's emitter marks only
 * non-optional keys required; strict mode wants all of them, and optionality is
 * expressed by allowing `null` in the member type instead.
 */
function withStrictDefaults(schema: Record<string, unknown>): Record<string, unknown> {
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (!node || typeof node !== "object") return node;

    const source = node as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(source)) out[key] = walk(value);

    if (out.type === "object" && out.properties && typeof out.properties === "object") {
      out.additionalProperties = false;
      out.required = Object.keys(out.properties as Record<string, unknown>);
    }
    return out;
  };

  return walk(schema) as Record<string, unknown>;
}

export const __testing = {
  withStrictDefaults,
  extractOutputText,
  isReasoningModel,
  PERMANENT_STATUSES,
};
