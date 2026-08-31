/**
 * OPENAI PROVIDER — PLAN.md Part VIII §8.3, Phase 5 task 5.1.
 *
 * ⚠️ THIS IS THE ONLY COVERAGE THE REAL PROVIDER HAS, and it exists because the
 * `MockProvider` path deliberately never touches this file. Two things here
 * fail in a way nothing else would catch:
 *
 *   1. THE JSON SCHEMA. `toJsonSchema()` runs on every real call and never in a
 *      mock test. OpenAI's strict mode rejects an object without
 *      `additionalProperties: false` and a complete `required` list — with a
 *      400, which `PERMANENT_STATUSES` correctly refuses to retry. So a single
 *      malformed nested object presents as "AI is permanently broken for this
 *      feature", not as a schema bug, and would ship green.
 *
 *   2. THE RETRY CLASSIFICATION. `packages/email` retried a permanent 403 eight
 *      times before anyone noticed. The same split is asserted here rather than
 *      discovered on a bill.
 *
 * `fetch` is injected, so nothing here reaches the network.
 */

import { describe, expect, it } from "vitest";
import { OpenAIProvider, __testing, isReasoningModel } from "../providers/openai";
import { toJsonSchema } from "../providers/base";
import { OUTPUT_SCHEMAS, type OutputSchemaFeature } from "../schemas/index";
import { AIProviderError, type ProviderRequest } from "../types";

const FEATURES = Object.keys(OUTPUT_SCHEMAS) as OutputSchemaFeature[];

function request(overrides: Partial<ProviderRequest> = {}): ProviderRequest {
  return {
    feature: "EXPLAIN_ISSUE",
    system: "system",
    user: "user",
    schemaName: "issue_explanation",
    jsonSchema: toJsonSchema("EXPLAIN_ISSUE"),
    options: {
      tier: "standard",
      maxOutputTokens: 400,
      timeoutMs: 5_000,
      traceId: "trace-1",
    },
    ...overrides,
  };
}

/** Walks every object node in a JSON Schema. */
function objectNodes(node: unknown, out: Record<string, unknown>[] = []) {
  if (Array.isArray(node)) {
    for (const item of node) objectNodes(item, out);
  } else if (node && typeof node === "object") {
    const record = node as Record<string, unknown>;
    if (record.type === "object" && record.properties) out.push(record);
    for (const value of Object.values(record)) objectNodes(value, out);
  }
  return out;
}

describe("toJsonSchema — every MVP feature converts", () => {
  for (const feature of FEATURES) {
    it(`${feature} produces an object schema with properties`, () => {
      const schema = toJsonSchema(feature);
      expect(schema.type).toBe("object");
      expect(schema.properties).toBeTypeOf("object");
    });
  }
});

describe("strict-mode requirements — §8.3", () => {
  for (const feature of FEATURES) {
    it(`${feature} satisfies strict mode at EVERY nesting level`, () => {
      const strict = __testing.withStrictDefaults(toJsonSchema(feature));
      const nodes = objectNodes(strict);

      expect(nodes.length).toBeGreaterThan(0);
      for (const node of nodes) {
        // Both are required by strict mode, and `fix_recommendation` has a
        // NESTED object (`steps[]`) — the exact shape a top-level-only fix
        // would miss.
        expect(node.additionalProperties).toBe(false);
        expect(node.required).toEqual(
          Object.keys(node.properties as Record<string, unknown>),
        );
      }
    });
  }

  it("reaches the nested steps object in fix_recommendation", () => {
    const strict = __testing.withStrictDefaults(toJsonSchema("RECOMMEND_FIX"));
    // Two object nodes: the root and each step. If the walk only handled the
    // root, this is 1 and the assertion above passes for the wrong reason.
    expect(objectNodes(strict).length).toBeGreaterThan(1);
  });
});

describe("response parsing", () => {
  it("prefers output_text when present", () => {
    expect(__testing.extractOutputText({ output_text: "{}" })).toBe("{}");
  });

  it("falls back to walking output[].content[]", () => {
    const text = __testing.extractOutputText({
      output: [
        { type: "reasoning" },
        { type: "message", content: [{ type: "output_text", text: '{"a":1}' }] },
      ],
    });
    expect(text).toBe('{"a":1}');
  });

  it("returns null when there is nothing to read", () => {
    expect(__testing.extractOutputText({ output: [{ type: "reasoning" }] })).toBeNull();
  });
});

describe("error classification — the packages/email lesson", () => {
  const provider = (status: number, body = "nope") =>
    new OpenAIProvider({
      apiKey: "k",
      models: { standard: "m", advanced: "m" },
      fetchImpl: async () =>
        new Response(body, { status, statusText: "err" }) as unknown as Response,
    });

  for (const status of [400, 401, 403, 404, 422]) {
    it(`${status} is NOT retryable`, async () => {
      await expect(provider(status).complete(request())).rejects.toMatchObject({
        retryable: false,
        status,
      });
    });
  }

  for (const status of [429, 500, 502, 503]) {
    it(`${status} IS retryable`, async () => {
      // 429 in particular: rate limiting is the definition of transient, and
      // classifying it as permanent would disable AI on the first busy minute.
      await expect(provider(status).complete(request())).rejects.toMatchObject({
        retryable: true,
      });
    });
  }

  it("classifies an abort as a retryable timeout", async () => {
    const timingOut = new OpenAIProvider({
      apiKey: "k",
      models: { standard: "m", advanced: "m" },
      fetchImpl: (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const error = new Error("aborted");
            error.name = "AbortError";
            reject(error);
          });
        }),
    });

    await expect(
      timingOut.complete(
        request({
          options: {
            tier: "standard",
            maxOutputTokens: 400,
            timeoutMs: 20,
            traceId: "t",
          },
        }),
      ),
    ).rejects.toMatchObject({ retryable: true });
  });
});

describe("a successful call", () => {
  it("sends strict structured output and returns usage", async () => {
    let sent: unknown;
    const provider = new OpenAIProvider({
      apiKey: "k",
      models: { standard: "std-model", advanced: "adv-model" },
      fetchImpl: async (_url, init) => {
        sent = JSON.parse(String(init?.body));
        return new Response(
          JSON.stringify({
            model: "std-model",
            output_text: '{"ok":true}',
            usage: { input_tokens: 400, output_tokens: 250 },
          }),
          { status: 200 },
        ) as unknown as Response;
      },
    });

    const response = await provider.complete(request());

    const body = sent as {
      model: string;
      max_output_tokens: number;
      text: { format: { strict: boolean; type: string; name: string } };
    };
    // The tier→model mapping comes from config, never from the provider.
    expect(body.model).toBe("std-model");
    expect(body.max_output_tokens).toBe(400);
    expect(body.text.format.strict).toBe(true);
    expect(body.text.format.type).toBe("json_schema");

    expect(response.raw).toEqual({ ok: true });
    expect(response.usage.promptTokens).toBe(400);
    // ~400 in / 250 out at standard-tier pricing ≈ $0.0004 (§8.5's ASSUMPTION).
    expect(response.usage.costMicroCents).toBeGreaterThan(0);
  });

  it("returns unparseable text as `raw` so the REPAIR path can run", async () => {
    // ⚠️ NOT a throw. A formatting slip is a stage-1 validation failure, which
    // is repairable; throwing would classify it as a provider outage and skip
    // the one corrective attempt §8.8 specifies for exactly this case.
    const provider = new OpenAIProvider({
      apiKey: "k",
      models: { standard: "m", advanced: "m" },
      fetchImpl: async () =>
        new Response(
          JSON.stringify({ output_text: "Sure! Here is the JSON: {oops" }),
          { status: 200 },
        ) as unknown as Response,
    });

    const response = await provider.complete(request());
    expect(typeof response.raw).toBe("string");
  });

  it("throws a retryable error on an empty completion", async () => {
    const provider = new OpenAIProvider({
      apiKey: "k",
      models: { standard: "m", advanced: "m" },
      fetchImpl: async () =>
        new Response(JSON.stringify({ output: [] }), { status: 200 }) as unknown as Response,
    });

    await expect(provider.complete(request())).rejects.toBeInstanceOf(AIProviderError);
  });
});

/**
 * REASONING MODELS — every assertion here was measured against the live API
 * first, then frozen as a test. Both directions of the `reasoning` parameter
 * fail, which is why the predicate exists at all:
 *
 *   gpt-4o-mini + reasoning → 400 unsupported_parameter (PERMANENT, never retried)
 *   gpt-5-nano  without it  → 256 of a 400-token cap spent before writing a word
 */
describe("isReasoningModel", () => {
  for (const model of ["gpt-5", "gpt-5-nano", "gpt-5-mini", "o1", "o3", "o4-mini"]) {
    it(`${model} is a reasoning model`, () => {
      expect(isReasoningModel(model)).toBe(true);
    });
  }

  for (const model of ["gpt-4o-mini", "gpt-4o", "gpt-4.1", "some-future-model"]) {
    it(`${model} is NOT`, () => {
      expect(isReasoningModel(model)).toBe(false);
    });
  }

  it("fails toward NOT sending for an unrecognised id", () => {
    // ⚠️ The safe direction: a model we have never seen degrades to "reasoning
    // costs more tokens than we would like" (a bill), never to a permanent 400
    // on every call (an outage).
    expect(isReasoningModel("anthropic-something")).toBe(false);
  });

  it("ignores surrounding whitespace", () => {
    expect(isReasoningModel(" gpt-5-nano ")).toBe(true);
  });
});

describe("the reasoning parameter is sent conditionally", () => {
  const capture = async (model: string, reasoningEffort?: string) => {
    let sent: Record<string, unknown> = {};
    const provider = new OpenAIProvider({
      apiKey: "k",
      models: { standard: model, advanced: model },
      ...(reasoningEffort ? { reasoningEffort } : {}),
      fetchImpl: async (_url, init) => {
        sent = JSON.parse(String(init?.body));
        return new Response(
          JSON.stringify({
            status: "completed",
            output: [{ content: [{ text: '{"ok":true}' }] }],
            usage: { input_tokens: 10, output_tokens: 5 },
          }),
          { status: 200 },
        ) as unknown as Response;
      },
    });
    await provider.complete(request());
    return sent;
  };

  it("OMITS it for gpt-4o-mini — sending it is a permanent 400", async () => {
    expect(await capture("gpt-4o-mini", "minimal")).not.toHaveProperty("reasoning");
  });

  it("SENDS it for gpt-5-nano", async () => {
    expect(await capture("gpt-5-nano", "minimal")).toMatchObject({
      reasoning: { effort: "minimal" },
    });
  });

  it("omits it when no effort is configured", async () => {
    expect(await capture("gpt-5-nano")).not.toHaveProperty("reasoning");
  });
});

describe("an `incomplete` 200 is NOT retried", () => {
  const incomplete = (reasoningTokens: number) =>
    new OpenAIProvider({
      apiKey: "k",
      models: { standard: "gpt-5-nano", advanced: "gpt-5-nano" },
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            status: "incomplete",
            incomplete_details: { reason: "max_output_tokens" },
            output: [],
            usage: {
              input_tokens: 400,
              output_tokens: reasoningTokens,
              output_tokens_details: { reasoning_tokens: reasoningTokens },
            },
          }),
          { status: 200 },
        ) as unknown as Response,
    });

  it("classifies the token-cap cut as permanent", async () => {
    // ⚠️ The `packages/email` lesson arriving in a 200 BODY instead of a status
    // code: same context + same cap = same outcome, so a retry is a second
    // identical bill for nothing.
    await expect(incomplete(256).complete(request())).rejects.toMatchObject({
      retryable: false,
    });
  });

  it("names the reasoning tokens in the message, so the fix is obvious", async () => {
    await expect(incomplete(256).complete(request())).rejects.toThrow(
      /256 of them went on reasoning/,
    );
  });

  it("does not mention reasoning when there was none", async () => {
    await expect(incomplete(0).complete(request())).rejects.toThrow(
      /max_output_tokens/,
    );
  });
});

describe("the real wire shape", () => {
  it("reads text from output[].content[] when output_text is ABSENT", async () => {
    /*
     * ⚠️ THIS IS THE SHAPE THE LIVE API ACTUALLY RETURNS. Dumping a real 200
     * showed no `output_text` key at all — it is an SDK-derived convenience and
     * we do not use the SDK. If this walk broke, every real call would return
     * null, throw "no output text", and be RETRIED — a silent money burn that
     * no mock-based test would catch.
     */
    const provider = new OpenAIProvider({
      apiKey: "k",
      models: { standard: "gpt-4o-mini", advanced: "gpt-5-nano" },
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            id: "resp_1",
            status: "completed",
            model: "gpt-4o-mini",
            incomplete_details: null,
            output: [
              {
                id: "msg_1",
                type: "message",
                status: "completed",
                role: "assistant",
                content: [
                  { type: "output_text", annotations: [], logprobs: [], text: '{"answer":"Hello!"}' },
                ],
              },
            ],
            usage: { input_tokens: 48, output_tokens: 7 },
          }),
          { status: 200 },
        ) as unknown as Response,
    });

    const response = await provider.complete(request());
    expect(response.raw).toEqual({ answer: "Hello!" });
  });
});
