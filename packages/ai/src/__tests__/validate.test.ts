/**
 * VALIDATION PIPELINE TESTS — PLAN.md Part VIII §8.6, Phase 5 task 5.4.
 *
 * ⚠️ THESE ARE THE ACCEPTANCE CRITERIA FOR THE PHASE, not incidental coverage.
 * Four of §12.3's seven Phase 5 criteria are asserted here, and each is driven
 * by a `MockProvider` behaviour rather than a hand-written bad object — so what
 * is proven is that the pipeline rejects output *in the shape a provider
 * actually returns it*, which is the only shape that matters.
 *
 * The dev-doc's order of attack: "Make `MockProvider` emit deliberately bad
 * output … and prove each validator rejects it. A validation pipeline written
 * after the happy path has holes."
 */

import { describe, expect, it } from "vitest";
import { createProvider, runFeature } from "../providers/base";
import { MockProvider, type MockBehaviour } from "../providers/mock";
import { validateAIOutput } from "../validate";
import { groundingIdsOf, type IssueContext } from "../context/index";
import type { CallOptions } from "../types";

const REF_A = "ev_01HXAAAAAAAAAAAAAAAAAAAAAA";
const REF_B = "ev_01HXBBBBBBBBBBBBBBBBBBBBBB";

const CONTEXT: IssueContext = {
  issue: {
    ruleId: "PDM-R001",
    severity: "CRITICAL",
    category: "PRE_CONSENT_TRACKING",
    message: "A marketing tracker was detected before consent was given.",
    confidence: 0.97,
    firstDetectedAt: "2026-08-01T10:00:00.000Z",
    occurrenceCount: 3,
  },
  evidence: [
    {
      ref: REF_A,
      kind: "NETWORK_REQUEST",
      consentPhase: "NO_CONSENT",
      observedAtMs: 1842,
      summary: "GET connect.facebook.net/en_US/fbevents.js → 200",
    },
    {
      ref: REF_B,
      kind: "COOKIE",
      consentPhase: "NO_CONSENT",
      observedAtMs: 1990,
      summary: "_fbp set on .example.com, 90 days, not HttpOnly",
    },
  ],
  site: { registrableDomain: "example.com", cms: "WordPress", cmp: "Complianz" },
  history: {
    previousScanStatus: "clean",
    driftChangeType: "TRACKER_ADDED",
    daysSinceFirstDetected: 3,
  },
};

const OPTIONS: CallOptions = {
  tier: "standard",
  maxOutputTokens: 400,
  timeoutMs: 5_000,
  traceId: "trace-test",
};

/** Every mock is given the REAL refs from `CONTEXT`, so a "valid" response is
 *  grounded for the right reason rather than because the mock agreed with
 *  itself. */
function providerWith(behaviour: MockBehaviour): MockProvider {
  return new MockProvider({ behaviour, groundedRefs: [REF_A, REF_B] });
}

describe("validateAIOutput — stage 1: schema", () => {
  it("rejects an output missing required fields", () => {
    const result = validateAIOutput("EXPLAIN_ISSUE", { nonsense: true }, {
      groundingIds: groundingIdsOf(CONTEXT),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.stage).toBe("schema");
    expect(result.failure.errorCode).toBe("VALIDATION_FAILED");
  });

  it("marks ONLY a schema failure as repairable — §8.8", () => {
    const schemaFailure = validateAIOutput("EXPLAIN_ISSUE", {}, {
      groundingIds: groundingIdsOf(CONTEXT),
    });
    expect(schemaFailure.ok).toBe(false);
    if (!schemaFailure.ok) expect(schemaFailure.failure.repairable).toBe(true);
  });
});

describe("validateAIOutput — stage 2: grounding (P2)", () => {
  it("rejects a fabricated evidence ref", async () => {
    const result = await runFeature(
      providerWith("fabricated_ref"),
      "EXPLAIN_ISSUE",
      CONTEXT,
      OPTIONS,
    );
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("GROUNDING_FAILED");
    expect(result.errorMessage).toContain("ev_totally_made_up_0000");
  });

  it("rejects the WHOLE response when one ref of several is unresolvable", () => {
    const result = validateAIOutput(
      "EXPLAIN_ISSUE",
      {
        summary: "A marketing tracker was detected before a consent choice was made.",
        technical_reason:
          "The scanner recorded the request during the no-consent phase of the scan.",
        likely_cause: "The tag fires on page load.",
        confidence: "high",
        // One real, one invented — §8.6: "A single unresolvable ref rejects the
        // whole response."
        evidence_refs: [REF_A, "ev_invented"],
        recommended_action: "Gate the tag behind a consent trigger.",
        is_hypothesis: false,
      },
      { groundingIds: groundingIdsOf(CONTEXT) },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.stage).toBe("grounding");
    expect(result.failure.repairable).toBe(false);
  });

  it("rejects a real id that was never supplied in the context", () => {
    // The dangerous near-miss: a well-formed id from another issue. Grounding
    // means "only what it was shown", not "only ids that exist".
    const result = validateAIOutput(
      "EXPLAIN_ISSUE",
      {
        summary: "A marketing tracker was detected before a consent choice was made.",
        technical_reason:
          "The scanner recorded the request during the no-consent phase of the scan.",
        likely_cause: "The tag fires on page load.",
        confidence: "high",
        evidence_refs: ["ev_01HXZZZZZZZZZZZZZZZZZZZZZZ"],
        recommended_action: "Gate the tag behind a consent trigger.",
        is_hypothesis: false,
      },
      { groundingIds: groundingIdsOf(CONTEXT) },
    );
    expect(result.ok).toBe(false);
  });

  it("rejects an output that cites nothing", async () => {
    const result = await runFeature(
      providerWith("no_refs"),
      "EXPLAIN_ISSUE",
      CONTEXT,
      OPTIONS,
    );
    expect(result.ok).toBe(false);
    // `.min(1)` catches this at stage 1 — citing nothing is structurally
    // impossible before grounding is even consulted.
    expect(result.errorCode).toBe("VALIDATION_FAILED");
  });
});

describe("validateAIOutput — stage 3: terminology (§1.12)", () => {
  it("rejects a response asserting a legal conclusion", async () => {
    const result = await runFeature(
      providerWith("banned_terminology"),
      "EXPLAIN_ISSUE",
      CONTEXT,
      OPTIONS,
    );
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("TERMINOLOGY_REJECTED");
  });

  it("applies the strictest check to a client message — §8.5", async () => {
    const result = await runFeature(
      providerWith("banned_terminology"),
      "CLIENT_MESSAGE",
      {
        site: { registrableDomain: "example.com" },
        tone: "reassuring",
        fixInProgress: true,
        issues: [
          {
            ruleId: "PDM-R001",
            severity: "CRITICAL",
            title: "Tracker detected before consent",
            message: "A marketing tracker was detected before consent was given.",
          },
        ],
      },
      OPTIONS,
    );
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("TERMINOLOGY_REJECTED");
  });
});

describe("validateAIOutput — stage 4: claim check", () => {
  it("rejects a response claiming it performed the fix", async () => {
    const result = await runFeature(
      providerWith("claimed_action"),
      "EXPLAIN_ISSUE",
      CONTEXT,
      OPTIONS,
    );
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("CLAIM_REJECTED");
  });

  it("does NOT fire on legitimate advisory language", () => {
    const result = validateAIOutput(
      "EXPLAIN_ISSUE",
      {
        summary: "A marketing tracker was detected before a consent choice was made.",
        technical_reason:
          "The scanner recorded the request during the no-consent phase of the scan.",
        likely_cause: "The tag fires on page load rather than from a consent trigger.",
        confidence: "high",
        evidence_refs: [REF_A],
        // "can be fixed" is advice, not a claim. A validator that cries wolf
        // here gets loosened, and then it stops catching the real thing.
        recommended_action:
          "This can be fixed by moving the tag behind a consent-gated trigger.",
        is_hypothesis: false,
      },
      { groundingIds: groundingIdsOf(CONTEXT) },
    );
    expect(result.ok).toBe(true);
  });
});

describe("validateAIOutput — stage 5: shape sanity", () => {
  it("rejects degenerate repeated text that satisfies the schema", async () => {
    const result = await runFeature(
      providerWith("degenerate"),
      "EXPLAIN_ISSUE",
      CONTEXT,
      OPTIONS,
    );
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("VALIDATION_FAILED");
  });
});

describe("the repair path — §8.8", () => {
  it("retries a schema failure ONCE and accepts the corrected response", async () => {
    const provider = new MockProvider({
      behaviour: "schema_then_repair",
      groundedRefs: [REF_A, REF_B],
    });
    const result = await runFeature(provider, "EXPLAIN_ISSUE", CONTEXT, OPTIONS);

    expect(result.ok).toBe(true);
    expect(provider.calls).toHaveLength(2);
    expect(provider.calls[1]?.user).toContain("failed validation");
  });

  it("gives up after one repair", async () => {
    const provider = new MockProvider({
      behaviour: "always_malformed",
      groundedRefs: [REF_A],
    });
    const result = await runFeature(provider, "EXPLAIN_ISSUE", CONTEXT, OPTIONS);

    expect(result.ok).toBe(false);
    expect(provider.calls).toHaveLength(2);
  });

  it("NEVER repairs a grounding failure — one call only", async () => {
    const provider = providerWith("fabricated_ref");
    await runFeature(provider, "EXPLAIN_ISSUE", CONTEXT, OPTIONS);
    // §8.8: "a model that invented a reference … is not to be coaxed."
    expect(provider.calls).toHaveLength(1);
  });

  it("NEVER repairs a terminology failure — one call only", async () => {
    const provider = providerWith("banned_terminology");
    await runFeature(provider, "EXPLAIN_ISSUE", CONTEXT, OPTIONS);
    expect(provider.calls).toHaveLength(1);
  });
});

describe("provider transport failures", () => {
  it("marks a timeout retryable", async () => {
    const result = await runFeature(
      providerWith("transient_error"),
      "EXPLAIN_ISSUE",
      CONTEXT,
      OPTIONS,
    );
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("PROVIDER_UNAVAILABLE");
    expect(result.retryable).toBe(true);
  });

  it("marks a 401 NOT retryable — the packages/email lesson", async () => {
    const result = await runFeature(
      providerWith("permanent_error"),
      "EXPLAIN_ISSUE",
      CONTEXT,
      OPTIONS,
    );
    expect(result.retryable).toBe(false);
  });

  it("does not send a repair prompt after a transport failure", async () => {
    const provider = providerWith("transient_error");
    await runFeature(provider, "EXPLAIN_ISSUE", CONTEXT, OPTIONS);
    expect(provider.calls).toHaveLength(1);
  });
});

describe("the happy path", () => {
  it("accepts a grounded, correctly-worded explanation", async () => {
    const result = await runFeature(
      providerWith("valid"),
      "EXPLAIN_ISSUE",
      CONTEXT,
      OPTIONS,
    );
    expect(result.ok).toBe(true);
    expect(result.data).toMatchObject({ evidence_refs: [REF_A, REF_B] });
  });

  it("exposes the four §8.3 methods through createProvider", async () => {
    const provider = createProvider(
      new MockProvider({ groundedRefs: [REF_A, REF_B] }),
    );
    expect(provider.name).toBe("mock");
    const explained = await provider.explainIssue(CONTEXT, OPTIONS);
    const fixed = await provider.recommendFix(CONTEXT, OPTIONS);
    expect(explained.ok).toBe(true);
    expect(fixed.ok).toBe(true);
  });

  it("clamps maxOutputTokens to the per-feature cap — §8.9", async () => {
    const completion = new MockProvider({ groundedRefs: [REF_A, REF_B] });
    const provider = createProvider(completion);
    // A caller asking for 4000 must not be able to raise the ceiling.
    await provider.explainIssue(CONTEXT, { ...OPTIONS, maxOutputTokens: 4000 });
    expect(completion.calls[0]?.options.maxOutputTokens).toBe(400);
  });
});
