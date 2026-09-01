import { describe, expect, it, vi } from "vitest";
import type { Page } from "playwright";
import { DEFAULT_BUDGET, allowAnyUrl, navigate } from "../navigate";

/**
 * ⚠️ EVERY CALL PASSES `allowAnyUrl`. These fakes use `.test` hostnames, which
 * do not resolve, so the real guard (now applied inside `navigate` — §10.3
 * R4/R5) refuses them before Playwright is reached and every outcome would be
 * SSRF_BLOCKED. The guard's own enforcement is asserted in
 * `ssrf-navigation.test.ts`; this file is about the error CLASSIFICATION that
 * happens after a URL is allowed.
 */
const PASS = { guard: allowAnyUrl };

/**
 * NAVIGATION OUTCOMES — PLAN.md Part IV §4.3, §4.4, Phase 2 task 2.5.
 *
 * ⚠️ THE FOUR OUTCOMES ARE NOT INTERCHANGEABLE — they decide whether a scan is
 * `PARTIAL` or `FAILED`, and therefore whether the product may say anything at
 * all about the site (P5). `HTTP_ERROR` on a 404 is a real answer about the
 * page; `NAV_TIMEOUT` is our own budget running out and says nothing about the
 * site; `NAV_FAILED` is DNS or TLS. Collapsing them would let "we could not
 * reach you" and "your page returns 500" render as the same message, and one of
 * those is the customer's problem while the other is ours.
 *
 * The happy paths are covered by `phase-runner.test.ts` and `scan.test.ts`,
 * which pay for real Chromium. These are the ERROR branches, which a real
 * browser cannot be made to produce deterministically — a fake `Page` is the
 * only way to assert a timeout is classified as a timeout every time.
 */

function pageThatGoes(impl: () => unknown): Page {
  return { goto: vi.fn(impl) } as unknown as Page;
}

describe("navigate — error classification", () => {
  it("classifies a Playwright timeout as NAV_TIMEOUT", async () => {
    // Playwright's timeout errors carry "Timeout" in the message; that string
    // is the only signal distinguishing our budget expiring from the host
    // being unreachable.
    const outcome = await navigate(
      pageThatGoes(() => {
        throw new Error("page.goto: Timeout 30000ms exceeded.");
      }),
      "https://slow.test",
      DEFAULT_BUDGET,
      PASS,
    );

    expect(outcome).toEqual({ ok: false, reason: "NAV_TIMEOUT", status: null });
  });

  it("classifies anything else as NAV_FAILED", async () => {
    // DNS failure, TLS failure, connection refused — all "we never got a
    // response", which is a different conversation with the customer than
    // "your site was too slow for our budget".
    const outcome = await navigate(
      pageThatGoes(() => {
        throw new Error("net::ERR_NAME_NOT_RESOLVED");
      }),
      "https://nope.test",
      DEFAULT_BUDGET,
      PASS,
    );

    expect(outcome).toEqual({ ok: false, reason: "NAV_FAILED", status: null });
  });

  it("handles a non-Error throw without crashing the phase", async () => {
    // A rejected promise carrying a string is not hypothetical in browser
    // automation, and an unhandled TypeError here would fail a scan whose
    // evidence is otherwise fine.
    const outcome = await navigate(
      pageThatGoes(() => {
        throw "socket hang up";
      }),
      "https://odd.test",
      DEFAULT_BUDGET,
      PASS,
    );

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe("NAV_FAILED");
  });

  it("treats a null response as NAV_FAILED, not a success", async () => {
    // ⚠️ `page.goto` resolves to null for a navigation that produced no
    // response (a download, an aborted commit). Reading `.status()` off it
    // would throw; treating it as OK would record a phase that never loaded.
    const outcome = await navigate(
      pageThatGoes(() => null),
      "https://x.test",
      DEFAULT_BUDGET,
      PASS,
    );
    expect(outcome).toEqual({ ok: false, reason: "NAV_FAILED", status: null });
  });

  it("reports HTTP_ERROR with the status for a 4xx", async () => {
    // A 404 is a real answer about the site and it is NOT scannable content —
    // continuing would record the behaviour of an error page and attribute it
    // to the monitored URL.
    const outcome = await navigate(
      pageThatGoes(() => ({ status: () => 404 })),
      "https://gone.test",
      DEFAULT_BUDGET,
      PASS,
    );
    expect(outcome).toEqual({ ok: false, reason: "HTTP_ERROR", status: 404 });
  });

  it("reports HTTP_ERROR with the status for a 5xx", async () => {
    const outcome = await navigate(
      pageThatGoes(() => ({ status: () => 503 })),
      "https://down.test",
      DEFAULT_BUDGET,
      PASS,
    );
    expect(outcome).toEqual({ ok: false, reason: "HTTP_ERROR", status: 503 });
  });

  it("does NOT treat a 3xx as an error — redirects are followed and pinned", async () => {
    /*
     * The boundary is `>= 400`, and it matters: a redirect is normal, and the
     * SSRF guard re-checks every hop separately (§10.3). Rejecting 3xx here
     * would break every site that redirects to www or upgrades to HTTPS, and
     * would do it for a security reason that is already handled elsewhere.
     */
    const page = {
      goto: vi.fn(() => ({ status: () => 302 })),
      waitForLoadState: vi.fn(async () => undefined),
    } as unknown as Page;

    const outcome = await navigate(
      page,
      "https://redirect.test",
      { ...DEFAULT_BUDGET, settleMaxMs: 10 },
      PASS,
    );
    expect(outcome.ok).toBe(true);
  });

  it("passes the configured navigation timeout to Playwright", async () => {
    // The budget is a real cost control — four phases × a 30s nav on a slow
    // site is two minutes of browser time before any recording happens.
    const goto = vi.fn(() => ({ status: () => 200 }));
    const page = {
      goto,
      waitForLoadState: vi.fn(async () => undefined),
    } as unknown as Page;

    await navigate(
      page,
      "https://x.test",
      { ...DEFAULT_BUDGET, navTimeoutMs: 1234, settleMaxMs: 10 },
      PASS,
    );

    expect(goto).toHaveBeenCalledWith(
      "https://x.test",
      expect.objectContaining({ timeout: 1234, waitUntil: "commit" }),
    );
  });
});
