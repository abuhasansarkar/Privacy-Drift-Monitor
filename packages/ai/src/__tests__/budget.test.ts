/**
 * BUDGET & MONEY UNITS — PLAN.md Part VIII §8.9.
 *
 * ⚠️ THE FIRST BLOCK EXISTS BECAUSE A 100× MONEY BUG SHIPPED THROUGH A GREEN
 * SUITE. `usdToMicroCents` and `microCentsToUsd` were both wrong by the same
 * factor, which made them exact inverses — so any round-trip assertion passed
 * while the platform daily cap was set to 1/100th of its configured value. A
 * `AI_DAILY_BUDGET_USD=50` would have killed AI for every tenant after roughly
 * FIFTY CENTS of real spend.
 *
 * The lesson is in how these are written: **anchor to absolute known values,
 * never to a round trip.** A round trip cannot see a consistent error, and this
 * error was consistent.
 */

import { describe, expect, it } from "vitest";
import {
  CREDIT_WARN_THRESHOLD,
  DEFAULT_PRICING,
  MICRO_CENTS_PER_USD,
  checkBudget,
  creditsFor,
  estimateCostMicroCents,
  microCentsToUsd,
  usdToMicroCents,
} from "../budget";

describe("money units — anchored, never round-tripped", () => {
  it("$1 is exactly 100,000,000 micro-cents", () => {
    // 1 micro-cent = 1e-6 cents = 1e-8 USD.
    expect(MICRO_CENTS_PER_USD).toBe(100_000_000);
    expect(usdToMicroCents(1)).toBe(100_000_000);
  });

  it("one cent is 1,000,000 micro-cents", () => {
    expect(usdToMicroCents(0.01)).toBe(1_000_000);
  });

  it("converts back to the absolute dollar value", () => {
    expect(microCentsToUsd(100_000_000)).toBe(1);
    expect(microCentsToUsd(1_000_000)).toBeCloseTo(0.01, 10);
  });

  it("prices a REAL observed call at its real dollar cost", () => {
    /*
     * ⚠️ THE ANCHOR THAT WOULD HAVE CAUGHT THE BUG. These token counts are from
     * an actual `gpt-4o-mini` EXPLAIN_ISSUE call recorded by
     * `worker/src/ai.smoke.ts`, and the expected dollar figure is computed from
     * OpenAI's published rate independently of our constants:
     *
     *     860 × $0.15/1M  +  226 × $0.60/1M  =  $0.0002646
     */
    const cost = estimateCostMicroCents("standard", {
      promptTokens: 860,
      completionTokens: 226,
    });
    expect(microCentsToUsd(cost)).toBeCloseTo(0.0002646, 9);
  });

  it("makes the $50 daily cap admit ~189k standard calls, not ~1.9k", () => {
    // The bug's actual signature: three orders of magnitude of headroom.
    const perCall = estimateCostMicroCents("standard", {
      promptTokens: 860,
      completionTokens: 226,
    });
    const calls = Math.floor(usdToMicroCents(50) / perCall);
    expect(calls).toBeGreaterThan(150_000);
    expect(microCentsToUsd(calls * perCall)).toBeCloseTo(50, 0);
  });
});

describe("DEFAULT_PRICING matches the configured models", () => {
  it("standard is gpt-4o-mini's $0.15 / $0.60 per 1M", () => {
    // One million input tokens must cost exactly fifteen cents.
    expect(
      microCentsToUsd(
        estimateCostMicroCents("standard", {
          promptTokens: 1_000_000,
          completionTokens: 0,
        }),
      ),
    ).toBeCloseTo(0.15, 6);
    expect(
      microCentsToUsd(
        estimateCostMicroCents("standard", {
          promptTokens: 0,
          completionTokens: 1_000_000,
        }),
      ),
    ).toBeCloseTo(0.6, 6);
  });

  it("advanced is gpt-5-nano's $0.05 / $0.40 per 1M", () => {
    expect(
      microCentsToUsd(
        estimateCostMicroCents("advanced", {
          promptTokens: 1_000_000,
          completionTokens: 0,
        }),
      ),
    ).toBeCloseTo(0.05, 6);
    expect(
      microCentsToUsd(
        estimateCostMicroCents("advanced", {
          promptTokens: 0,
          completionTokens: 1_000_000,
        }),
      ),
    ).toBeCloseTo(0.4, 6);
  });

  it("documents that the configured advanced model is CHEAPER than standard", () => {
    /*
     * ⚠️ NOT AN ASSERTION THAT THIS IS CORRECT — an assertion that it is TRUE,
     * so the inversion cannot quietly stop being visible.
     *
     * `gpt-5-nano` costs less than `gpt-4o-mini` on both axes, yet §8.9 charges
     * 3 credits for an advanced call and 1 for a standard one. Harmless today
     * (no MVP feature maps to `advanced` — both users are V1.5), and it must be
     * resolved before `CLASSIFY_TRACKER` or `ROOT_CAUSE` ship: either point
     * `AI_MODEL_ADVANCED` at a genuinely larger model, or revisit the ratio.
     *
     * If someone repoints the advanced model at a bigger one, this test fails
     * and the comment above is what tells them the inversion is gone — delete
     * it then.
     */
    expect(DEFAULT_PRICING.advanced.inputMicroCentsPerMillion).toBeLessThan(
      DEFAULT_PRICING.standard.inputMicroCentsPerMillion,
    );
    expect(DEFAULT_PRICING.advanced.outputMicroCentsPerMillion).toBeLessThan(
      DEFAULT_PRICING.standard.outputMicroCentsPerMillion,
    );
  });
});

describe("credit accounting — §8.9", () => {
  it("charges 1 for standard, 3 for advanced", () => {
    expect(creditsFor("standard", { fromCache: false, succeeded: true })).toBe(1);
    expect(creditsFor("advanced", { fromCache: false, succeeded: true })).toBe(3);
  });

  it("charges nothing for a cache hit or a failure", () => {
    expect(creditsFor("advanced", { fromCache: true, succeeded: true })).toBe(0);
    expect(creditsFor("advanced", { fromCache: false, succeeded: false })).toBe(0);
  });
});

describe("checkBudget", () => {
  const ok = {
    agency: { aiEnabled: true, monthlyCreditCap: 100, creditsUsedThisPeriod: 0 },
    platform: {
      spentMicroCentsToday: 0,
      dailyBudgetMicroCents: usdToMicroCents(50),
    },
    tier: "standard" as const,
    globallyEnabled: true,
  };

  it("allows a call with room in both budgets", () => {
    expect(checkBudget(ok).allowed).toBe(true);
  });

  it("blocks an ADVANCED call with 2 credits left — a cap must not be exceeded", () => {
    // 3-credit call, 2 remaining. `<= 0` instead of `< cost` would let this
    // through and put the agency 1 credit over its own ceiling.
    const decision = checkBudget({
      ...ok,
      tier: "advanced",
      agency: { aiEnabled: true, monthlyCreditCap: 100, creditsUsedThisPeriod: 98 },
    });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.errorCode).toBe("QUOTA_EXCEEDED");
  });

  it("allows a STANDARD call with 2 credits left", () => {
    expect(
      checkBudget({
        ...ok,
        agency: { aiEnabled: true, monthlyCreditCap: 100, creditsUsedThisPeriod: 98 },
      }).allowed,
    ).toBe(true);
  });

  it("warns at 80% of the cap — §8.9", () => {
    const decision = checkBudget({
      ...ok,
      agency: {
        aiEnabled: true,
        monthlyCreditCap: 100,
        creditsUsedThisPeriod: 100 * CREDIT_WARN_THRESHOLD,
      },
    });
    expect(decision.allowed).toBe(true);
    if (decision.allowed) expect(decision.warn).toBe(true);
  });

  it("treats a null cap as no limit, and reports remaining as unknown", () => {
    const decision = checkBudget({
      ...ok,
      agency: { aiEnabled: true, monthlyCreditCap: null, creditsUsedThisPeriod: 9_999 },
    });
    expect(decision.allowed).toBe(true);
    // ⚠️ `null` = UNKNOWN for display purposes; the meter hides rather than
    // drawing against a made-up denominator.
    if (decision.allowed) expect(decision.remainingCredits).toBeNull();
  });

  it("honours a cap of ZERO — 'spend nothing' is a real setting", () => {
    // The off-by-one that a falsy check would turn into "no cap at all".
    const decision = checkBudget({
      ...ok,
      agency: { aiEnabled: true, monthlyCreditCap: 0, creditsUsedThisPeriod: 0 },
    });
    expect(decision.allowed).toBe(false);
  });
});
