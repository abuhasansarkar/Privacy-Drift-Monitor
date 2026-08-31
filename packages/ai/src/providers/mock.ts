/**
 * MOCK PROVIDER — PLAN.md Part VIII §8.3, Phase 5 task 5.1, feature doc 16.
 *
 * "A `MockProvider` returning fixture responses is used in tests so the entire
 * test suite runs offline." (§8.3)
 *
 * ⚠️ ITS PRIMARY JOB IS TO LIE. The dev-doc is explicit: "Make `MockProvider`
 * emit deliberately bad output — fabricated refs, banned terms, unsupported
 * claims — and prove each validator rejects it. A validation pipeline written
 * after the happy path has holes."
 *
 * So the misbehaviours below are not test scaffolding bolted on afterwards;
 * they are the specification of what `validate.ts` must catch, written in the
 * same shape the real provider returns. Every entry in `MOCK_BEHAVIOURS`
 * corresponds to one row of §8.8's risk table and one acceptance criterion in
 * §12.3.
 *
 * ⚠️ NEVER REACHABLE IN PRODUCTION. `resolveProvider()` selects this only for
 * `AI_PROVIDER=mock`, and `.env.example` ships `openai`. It is exported from
 * the package because tests, the fixture matrix and local development all need
 * it — not because anything in `src/` may construct one.
 */

import { FORBIDDEN_TERMS } from "@pdm/shared/copy/terminology";
import type {
  CompletionProvider,
  ProviderRequest,
  ProviderResponse,
} from "../types";
import { AIProviderError } from "../types";

/**
 * The ways a model can fail us, each mapped to the validator stage that must
 * catch it. A behaviour with no validator behind it is a hole in the pipeline.
 */
export type MockBehaviour =
  /** A well-formed, grounded, correctly-worded response. */
  | "valid"
  /** Cites an evidence id that was never in the context → stage 2. */
  | "fabricated_ref"
  /** Cites nothing at all → stage 1 (`evidence_refs` is `.min(1)`). */
  | "no_refs"
  /** Asserts a legal conclusion → stage 3. */
  | "banned_terminology"
  /** Claims it performed the fix → stage 4. */
  | "claimed_action"
  /** Schema-valid shape, degenerate content → stage 5. */
  | "degenerate"
  /** Wrong shape on the first call, correct on the repair → stage 1 + repair. */
  | "schema_then_repair"
  /** Wrong shape twice → stage 1, no repair left. */
  | "always_malformed"
  /** Transport failure the job may retry. */
  | "transient_error"
  /** Transport failure the job must NOT retry (a 401 answers identically). */
  | "permanent_error";

export interface MockProviderOptions {
  behaviour?: MockBehaviour;
  /** Per-feature override, so one test can mix a good and a bad response. */
  behaviourByFeature?: Partial<Record<string, MockBehaviour>>;
  /**
   * The refs a `valid` response should cite. Supplied by the test from the
   * context it built — a mock that invented its own "valid" refs would pass
   * grounding for the wrong reason.
   */
  groundedRefs?: string[];
  latencyMs?: number;
  usage?: { promptTokens: number; completionTokens: number };
}

export class MockProvider implements CompletionProvider {
  readonly name = "mock";
  /** Every request seen, so tests can assert the prompt and the token cap. */
  readonly calls: ProviderRequest[] = [];

  private readonly options: MockProviderOptions;
  private attemptsByFeature = new Map<string, number>();

  constructor(options: MockProviderOptions = {}) {
    this.options = options;
  }

  /** Resets the per-feature attempt counter the repair fixtures depend on. */
  reset(): void {
    this.calls.length = 0;
    this.attemptsByFeature.clear();
  }

  async complete(request: ProviderRequest): Promise<ProviderResponse> {
    this.calls.push(request);

    const attempt = (this.attemptsByFeature.get(request.feature) ?? 0) + 1;
    this.attemptsByFeature.set(request.feature, attempt);

    const behaviour =
      this.options.behaviourByFeature?.[request.feature] ??
      this.options.behaviour ??
      "valid";

    if (behaviour === "transient_error") {
      throw new AIProviderError("Upstream timeout", { retryable: true, status: 504 });
    }
    if (behaviour === "permanent_error") {
      throw new AIProviderError("Invalid API key", { retryable: false, status: 401 });
    }

    const usage = this.options.usage ?? { promptTokens: 420, completionTokens: 180 };

    return {
      raw: this.body(request, behaviour, attempt),
      usage: { ...usage, costMicroCents: 0 },
      model: "mock-standard",
      latencyMs: this.options.latencyMs ?? 12,
    };
  }

  /**
   * The refs a `valid` response cites.
   *
   * ⚠️ IT READS THEM OUT OF THE REQUEST IT WAS JUST HANDED, exactly as a real
   * model does. This was NOT the original design — the mock only used
   * `options.groundedRefs`, which tests supply — and running the real job path
   * with `AI_PROVIDER=mock` exposed the hole: `resolveProvider()` constructs a
   * `MockProvider` with no options, so every "valid" response cited nothing,
   * failed `evidence_refs.min(1)`, and reported `VALIDATION_FAILED`. Local
   * development against the mock could never succeed, and the failure looked
   * exactly like a broken validator rather than a mock that did not know the
   * ids. Reading the context is what makes the mock a faithful stand-in.
   *
   * `options.groundedRefs` still wins when supplied, because a test asserting a
   * grounding REJECTION needs to control the refs precisely.
   */
  private refs(request?: ProviderRequest): string[] {
    if (this.options.groundedRefs?.length) {
      return this.options.groundedRefs.slice(0, 2);
    }
    if (!request) return [];

    // The context is serialised into the user prompt as canonical JSON, so the
    // anchors are `"ref":"…"` (issue features) or `"ref"` inside `events`
    // (drift). Both use the same key, so one pattern covers both.
    const found = [...request.user.matchAll(/"ref"\s*:\s*"([^"]{1,64})"/g)].map(
      (match) => match[1] as string,
    );
    return [...new Set(found)].slice(0, 2);
  }

  private body(
    request: ProviderRequest,
    behaviour: MockBehaviour,
    attempt: number,
  ): unknown {
    if (behaviour === "always_malformed") return { nonsense: true };
    if (behaviour === "schema_then_repair" && attempt === 1) {
      return { nonsense: true };
    }

    switch (request.feature) {
      case "EXPLAIN_ISSUE":
        return this.explanation(behaviour, request);
      case "RECOMMEND_FIX":
        return this.fix(behaviour, request);
      case "SUMMARIZE_DRIFT":
        return this.drift(behaviour, request);
      case "CLIENT_MESSAGE":
        return this.message(behaviour);
      default:
        return { nonsense: true };
    }
  }

  private explanation(behaviour: MockBehaviour, request?: ProviderRequest): unknown {
    const base = {
      summary:
        "A marketing tracker was detected loading before any consent choice was recorded.",
      technical_reason:
        "During the no-consent phase the scanner recorded a request to a marketing " +
        "endpoint and a first-party cookie written by the same script, both before " +
        "the consent banner was interacted with.",
      likely_cause:
        "The tag appears to fire on page load rather than from a consent-gated trigger.",
      confidence: "high" as const,
      evidence_refs: this.refs(request),
      recommended_action:
        "Move the tag behind a consent-gated trigger and re-scan to confirm.",
      is_hypothesis: false,
    };

    switch (behaviour) {
      case "fabricated_ref":
        // ⚠️ THE HEADLINE FIXTURE. §12.3: "A response with a fabricated ref is
        // rejected and the deterministic content shows instead."
        return { ...base, evidence_refs: ["ev_totally_made_up_0000"] };
      case "no_refs":
        return { ...base, evidence_refs: [] };
      case "banned_terminology":
        return { ...base, summary: bannedSentence() };
      case "claimed_action":
        return {
          ...base,
          recommended_action:
            "I have already fixed the tag configuration, so no further action is needed.",
        };
      case "degenerate":
        return {
          ...base,
          technical_reason: Array.from({ length: 14 })
            .map(() => "The tracker fired before consent was given")
            .join(". "),
        };
      default:
        return base;
    }
  }

  private fix(behaviour: MockBehaviour, request?: ProviderRequest): unknown {
    const base = {
      steps: [
        {
          order: 1,
          action: "Open the tag configuration and remove the all-pages trigger.",
          where: "Google Tag Manager → Tags → Meta Pixel",
        },
        {
          order: 2,
          action: "Add a consent-gated trigger that fires only after marketing consent.",
          where: "Google Tag Manager → Triggers",
        },
      ],
      affected_system: "tag_manager" as const,
      risk: "medium" as const,
      verification_steps: [
        "Re-scan the site and confirm the no-consent phase records no request to the endpoint.",
        "Open the site in a private window and check the network panel before accepting.",
      ],
      confidence: "medium" as const,
      evidence_refs: this.refs(request),
    };
    if (behaviour === "fabricated_ref") {
      return { ...base, evidence_refs: ["ev_not_in_context"] };
    }
    if (behaviour === "claimed_action") {
      return {
        ...base,
        verification_steps: ["This has been resolved, no verification is required."],
      };
    }
    return base;
  }

  private drift(behaviour: MockBehaviour, request?: ProviderRequest): unknown {
    const base = {
      headline: "One new marketing tracker appeared before consent this week.",
      narrative:
        "A marketing tracker that was not present in the previous scan was detected " +
        "during the no-consent phase. Two existing cookies were unchanged. The overall " +
        "direction is a degradation compared with the previous scan.",
      most_significant_change:
        "The newly detected marketing tracker, because it fires before a consent choice.",
      events_referenced: this.refs(request),
      confidence: "medium" as const,
    };
    if (behaviour === "fabricated_ref") {
      return { ...base, events_referenced: ["drift_made_up"] };
    }
    return base;
  }

  private message(behaviour: MockBehaviour): unknown {
    const base = {
      subject: "Privacy monitoring update for your website",
      body:
        "Hello,\n\nOur automated monitoring detected a marketing tracker loading on " +
        "your website before a visitor makes a consent choice. In practice this means " +
        "some analytics data may be collected earlier than your consent banner " +
        "suggests. We are reviewing the tag setup and will confirm once the change is " +
        "in place, then re-scan to check the result.\n\nThis is a technical " +
        "observation from automated monitoring rather than a legal assessment; any " +
        "legal questions are best directed to your own advisor.\n\nBest regards",
      tone: "reassuring" as const,
      mentions_no_legal_advice: true as const,
    };
    if (behaviour === "banned_terminology") {
      return { ...base, body: `${base.body}\n\n${bannedSentence()}` };
    }
    if (behaviour === "claimed_action") {
      return { ...base, body: base.body + "\n\nWe have already fixed this for you." };
    }
    return base;
  }
}

/**
 * A sentence containing a real forbidden term, taken FROM THE CANONICAL LIST
 * rather than typed out.
 *
 * ⚠️ TWO PROBLEMS SOLVED AT ONCE, and the second is the interesting one.
 *
 * First, `scripts/check-terminology.ts` scans `packages/` and does not skip
 * this file (it is not a `.test.ts`), so a literal banned word here would fail
 * the very gate this fixture exists to exercise. Sourcing it from
 * `FORBIDDEN_TERMS` keeps the source clean without a `terminology-allow`
 * marker — and an escape hatch on a file whose job is to emit banned language
 * is an escape hatch nobody would ever remember to remove.
 *
 * Second, and more valuable: the fixture can no longer DRIFT from the list the
 * validator enforces. A hand-typed banned phrase would keep passing this test
 * forever even if someone removed that phrase from `FORBIDDEN_TERMS` — the test
 * would then prove the validator catches a word it no longer bans, which is a
 * green test measuring nothing. Reading index 0 means the fixture always exercises
 * a term the gate really rejects today.
 */
function bannedSentence(): string {
  const term = FORBIDDEN_TERMS[0];
  if (term === undefined) {
    // ⚠️ THROWS RATHER THAN FALLING BACK TO A LITERAL. A hard-coded fallback
    // would put a banned word back into this file (failing the CI gate), and an
    // empty-string fallback would make the terminology fixture silently emit
    // clean text — a test that passes because it stopped testing anything.
    throw new Error("FORBIDDEN_TERMS is empty; the terminology fixture cannot run.");
  }
  return `Our review found a clear ${term} of the applicable rules on this site.`;
}
