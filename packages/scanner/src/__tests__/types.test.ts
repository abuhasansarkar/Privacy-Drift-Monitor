import { describe, expect, it } from "vitest";
import {
  CONSENT_PHASES,
  deriveScanStatus,
  isRetryable,
  type PhaseResult,
  type PhaseStatus,
} from "../types";

/**
 * The two decisions in this file are the ones that, if wrong, produce the
 * failure modes the plan calls out by name:
 *
 *   deriveScanStatus — "an incomplete scan may never produce a clean verdict"
 *   isRetryable      — "deterministic failures are not retried"
 */

function phase(status: PhaseStatus): PhaseResult {
  return {
    phase: "NO_CONSENT",
    status,
    startedAt: new Date(),
    finishedAt: new Date(),
    durationMs: 0,
    actionMethod: null,
    actionConfidence: null,
    selectorUsed: null,
    elementText: null,
    inIframe: false,
    bannerDismissed: null,
    errorCode: null,
    errorMessage: null,
    requests: [],
    cookies: [],
    storage: [],
    consoleLogs: [],
    screenshots: [],
  };
}

describe("deriveScanStatus", () => {
  it("is COMPLETED only when every phase executed", () => {
    expect(deriveScanStatus([phase("EXECUTED"), phase("EXECUTED")], true)).toBe(
      "COMPLETED",
    );
  });

  it("is PARTIAL when any phase is UNDETERMINED", () => {
    // The one that matters: we failed to click Reject All, so we do not know
    // whether the site rejects. Reporting COMPLETED here would render a clean
    // verdict over an untested control (P6).
    expect(
      deriveScanStatus([phase("EXECUTED"), phase("UNDETERMINED")], true),
    ).toBe("PARTIAL");
  });

  it("is PARTIAL when a phase FAILED or was SKIPPED", () => {
    expect(deriveScanStatus([phase("EXECUTED"), phase("FAILED")], true)).toBe(
      "PARTIAL",
    );
    expect(deriveScanStatus([phase("EXECUTED"), phase("SKIPPED")], true)).toBe(
      "PARTIAL",
    );
  });

  it("is FAILED when navigation never succeeded", () => {
    expect(deriveScanStatus([phase("EXECUTED")], false)).toBe("FAILED");
  });

  it("is FAILED, not COMPLETED, when no phase ran at all", () => {
    // An empty phase list trivially satisfies `every()`. Without the explicit
    // length check this returns COMPLETED for a scan that did nothing.
    expect(deriveScanStatus([], true)).toBe("FAILED");
  });
});

describe("isRetryable", () => {
  it.each([
    "BROWSER_POOL_TIMEOUT",
    "BROWSER_CRASHED",
    "NAV_TIMEOUT",
    "NETWORK_RESET",
    "HTTP_SERVER_ERROR",
  ] as const)("retries transient %s", (code) => {
    expect(isRetryable(code)).toBe(true);
  });

  it.each([
    "DNS_NXDOMAIN",
    "SSRF_BLOCKED",
    "HTTP_CLIENT_ERROR",
    "TLS_NAME_MISMATCH",
    "ROBOTS_DISALLOWED",
    "BOT_CHALLENGE",
  ] as const)("never retries deterministic %s", (code) => {
    // Retrying these burns the scarcest resource in the system three times over
    // and delays real work (§4.4).
    expect(isRetryable(code)).toBe(false);
  });

  it("treats SSRF_BLOCKED as terminal", () => {
    // Retrying a blocked address is retrying an attack.
    expect(isRetryable("SSRF_BLOCKED")).toBe(false);
  });
});

describe("CONSENT_PHASES", () => {
  it("is the consent journeys, in execution order", () => {
    expect(CONSENT_PHASES).toEqual([
      "NO_CONSENT",
      "REJECT_ALL",
      "ACCEPT_ALL",
      "WITHDRAW",
      "GLOBAL_PRIVACY_CONTROL",
      "INTERACTIVE_ACTION",
    ]);
  });
});
