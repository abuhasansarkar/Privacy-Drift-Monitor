/**
 * ORCHESTRATOR TESTS — PLAN.md Part VIII §8.2, §8.9, Phase 5 tasks 5.5–5.6.
 *
 * The three §12.3 acceptance criteria this file owns:
 *
 *   - "An identical second request is served from cache at zero cost"
 *   - "Exceeding the credit cap blocks the call BEFORE the provider is contacted"
 *   - "With the AI provider unreachable, every other part of the product works
 *      and the AI sections show the unavailable state"
 *
 * ⚠️ "BEFORE" IS ASSERTED BY COUNTING PROVIDER CALLS, not by checking the
 * return value. A cap that blocks after the response has arrived returns the
 * same error object; the only observable difference is whether the provider was
 * touched, so that is what is measured.
 */

import { describe, expect, it } from "vitest";
import { MockProvider, type MockBehaviour } from "../providers/mock";
import { runAI, type AIRunPorts, type RecordedCall } from "../run";
import type { IssueContext } from "../context/index";
import type { AIConfig } from "../config";
import { usdToMicroCents } from "../budget";

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

const CONFIG: AIConfig = {
  provider: "mock",
  apiKey: "test-key",
  baseUrl: null,
  models: { standard: "mock-standard", advanced: "mock-advanced" },
  maxInputTokens: 1500,
  timeoutMs: 5_000,
  dailyBudgetUsd: 50,
  enabled: true,
  cacheTtlDays: 7,
  reasoningEffort: "minimal",
};

/** An in-memory stand-in for the three database ports plus platform spend. */
function makePorts(overrides: Partial<AIRunPorts> = {}) {
  const rows: RecordedCall[] = [];
  let platformSpend = 0;
  const cache = new Map<string, unknown>();

  const ports: AIRunPorts & { rows: RecordedCall[]; cache: Map<string, unknown> } = {
    rows,
    cache,
    async findCached(inputHash) {
      const hit = cache.get(inputHash);
      return hit === undefined ? null : { id: `cached-${inputHash}`, output: hit };
    },
    async record(row) {
      rows.push(row);
      // Mirrors the repository: only a real SUCCESS becomes a cache entry.
      if (row.status === "SUCCESS" && !row.fromCache) {
        cache.set(row.inputHash, row.output);
      }
      return { id: `req-${rows.length}` };
    },
    async loadAgencyState() {
      return { aiEnabled: true, monthlyCreditCap: 100, creditsUsedThisPeriod: 0 };
    },
    async loadPlatformState() {
      return {
        spentMicroCentsToday: platformSpend,
        dailyBudgetMicroCents: usdToMicroCents(50),
      };
    },
    async addPlatformSpend(microCents) {
      platformSpend += microCents;
    },
    ...overrides,
  };

  return ports;
}

function input(traceId = "trace-1") {
  return {
    feature: "EXPLAIN_ISSUE" as const,
    context: CONTEXT,
    entityType: "issue",
    entityId: "issue-1",
    issueId: "issue-1",
    userId: "user-1",
    traceId,
  };
}

function mock(behaviour: MockBehaviour = "valid") {
  return new MockProvider({ behaviour, groundedRefs: [REF_A, REF_B] });
}

describe("caching — §8.9", () => {
  it("serves an identical second request from cache at zero cost", async () => {
    const ports = makePorts();
    const provider = mock();

    const first = await runAI(input(), { provider, ports, config: CONFIG });
    const second = await runAI(input("trace-2"), { provider, ports, config: CONFIG });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    expect(second.fromCache).toBe(true);
    expect(second.creditsCharged).toBe(0);
    // ⚠️ The cost claim, asserted directly: only ONE provider call happened.
    expect(provider.calls).toHaveLength(1);
    expect(ports.rows[1]?.status).toBe("CACHED");
    expect(ports.rows[1]?.costMicroCents).toBe(0);
  });

  it("misses when the context changes, because the hash covers it", async () => {
    const ports = makePorts();
    const provider = mock();

    await runAI(input(), { provider, ports, config: CONFIG });
    await runAI(
      {
        ...input("trace-2"),
        context: {
          ...CONTEXT,
          issue: { ...CONTEXT.issue, occurrenceCount: 4 },
        },
      },
      { provider, ports, config: CONFIG },
    );

    expect(provider.calls).toHaveLength(2);
  });

  it("does NOT serve a rejected response from cache", async () => {
    const ports = makePorts();
    const provider = mock("fabricated_ref");

    await runAI(input(), { provider, ports, config: CONFIG });
    await runAI(input("trace-2"), { provider, ports, config: CONFIG });

    // A validation rejection must never become a cache entry — serving one
    // would hand the user the hallucination the pipeline just refused.
    expect(provider.calls).toHaveLength(2);
    expect(ports.cache.size).toBe(0);
  });
});

describe("budget enforcement — §8.9, §12.3", () => {
  it("blocks at the credit cap BEFORE the provider is contacted", async () => {
    const provider = mock();
    const ports = makePorts({
      async loadAgencyState() {
        return { aiEnabled: true, monthlyCreditCap: 100, creditsUsedThisPeriod: 100 };
      },
    });

    const result = await runAI(input(), { provider, ports, config: CONFIG });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorCode).toBe("QUOTA_EXCEEDED");
    // ⚠️ THE ASSERTION THAT MATTERS.
    expect(provider.calls).toHaveLength(0);
  });

  it("blocks at the platform daily cap before the provider is contacted", async () => {
    const provider = mock();
    const ports = makePorts({
      async loadPlatformState() {
        return {
          spentMicroCentsToday: usdToMicroCents(50),
          dailyBudgetMicroCents: usdToMicroCents(50),
        };
      },
    });

    const result = await runAI(input(), { provider, ports, config: CONFIG });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorCode).toBe("PLATFORM_BUDGET_EXCEEDED");
    expect(provider.calls).toHaveLength(0);
  });

  it("blocks when the agency has turned AI off", async () => {
    const provider = mock();
    const ports = makePorts({
      async loadAgencyState() {
        return { aiEnabled: false, monthlyCreditCap: null, creditsUsedThisPeriod: 0 };
      },
    });

    const result = await runAI(input(), { provider, ports, config: CONFIG });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe("AI_DISABLED");
    expect(provider.calls).toHaveLength(0);
  });

  it("logs a blocked call so /admin/ai-usage can see the cap being hit", async () => {
    const ports = makePorts({
      async loadAgencyState() {
        return { aiEnabled: true, monthlyCreditCap: 10, creditsUsedThisPeriod: 10 };
      },
    });

    await runAI(input(), { provider: mock(), ports, config: CONFIG });

    expect(ports.rows).toHaveLength(1);
    expect(ports.rows[0]?.status).toBe("RATE_LIMITED");
    expect(ports.rows[0]?.creditsCharged).toBe(0);
    expect(ports.rows[0]?.costMicroCents).toBe(0);
  });

  it("still serves a CACHED response to an agency that is over its cap", async () => {
    // A hit costs nothing, and the customer already paid for it. Blocking a
    // read would take away content they have already bought.
    const ports = makePorts();
    await runAI(input(), { provider: mock(), ports, config: CONFIG });

    const cappedPorts = makePorts({
      findCached: ports.findCached,
      async loadAgencyState() {
        return { aiEnabled: true, monthlyCreditCap: 1, creditsUsedThisPeriod: 99 };
      },
    });
    const result = await runAI(input("trace-2"), {
      provider: mock(),
      ports: cappedPorts,
      config: CONFIG,
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.fromCache).toBe(true);
  });
});

describe("credit accounting — §8.9", () => {
  it("charges 1 credit for a successful standard call", async () => {
    const ports = makePorts();
    const result = await runAI(input(), { provider: mock(), ports, config: CONFIG });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.creditsCharged).toBe(1);
  });

  it("charges 0 credits for a FAILED call but still logs our provider cost", async () => {
    const ports = makePorts();
    const provider = new MockProvider({
      behaviour: "banned_terminology",
      groundedRefs: [REF_A, REF_B],
      usage: { promptTokens: 500, completionTokens: 200 },
    });

    await runAI(input(), { provider, ports, config: CONFIG });

    const row = ports.rows[0];
    expect(row?.creditsCharged).toBe(0);
    // The provider charged us; §8.9 keeps that for margin tracking.
    expect(row?.promptTokens).toBe(500);
    expect(row?.status).toBe("VALIDATION_FAILED");
  });
});

describe("graceful degradation — P3, §12.3", () => {
  it("returns a renderable outcome, never a throw, when the provider is down", async () => {
    const ports = makePorts();
    const result = await runAI(input(), {
      provider: mock("transient_error"),
      ports,
      config: CONFIG,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorCode).toBe("PROVIDER_UNAVAILABLE");
    // The UI has what it needs to render "temporarily unavailable" instead of
    // an error boundary.
    expect(result.requestId).not.toBeNull();
  });

  it("returns AI_DISABLED rather than throwing when no provider is configured", async () => {
    const result = await runAI(input(), {
      provider: null,
      ports: makePorts(),
      config: { ...CONFIG, enabled: false },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe("AI_DISABLED");
  });
});

describe("the AIRequest row", () => {
  it("records the prompt version, so an output traces to its prompt — §8.7", async () => {
    const ports = makePorts();
    await runAI(input(), { provider: mock(), ports, config: CONFIG });
    expect(ports.rows[0]?.promptVersion).toBe("EXPLAIN_ISSUE_V1");
  });

  it("records the entity so the output can be found again", async () => {
    const ports = makePorts();
    await runAI(input(), { provider: mock(), ports, config: CONFIG });
    expect(ports.rows[0]).toMatchObject({
      entityType: "issue",
      entityId: "issue-1",
      issueId: "issue-1",
      userId: "user-1",
    });
  });
});
