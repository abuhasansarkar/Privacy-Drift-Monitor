import { describe, expect, it, vi } from "vitest";
import { verifyTurnstile } from "../turnstile";

/**
 * TURNSTILE — PLAN.md §3.2, feature doc 18, Phase 6 task 6.5.
 *
 * ⚠️ THE FAIL DIRECTION IS THE ENTIRE POINT OF THIS SUITE. A challenge that
 * fails OPEN under load is not a challenge — an attacker who can make our call
 * to Cloudflare time out has switched the control off. The one case that fails
 * open is "no secret configured", which is development and CI, and it reports
 * `configured: false` so the caller can say so out loud.
 */

function respondWith(body: unknown, ok = true): typeof fetch {
  return vi.fn(async () => ({
    ok,
    status: ok ? 200 : 500,
    json: async () => body,
  })) as unknown as typeof fetch;
}

describe("verifyTurnstile", () => {
  it("passes and reports itself unconfigured when no secret is set", () => {
    return expect(
      verifyTurnstile({ token: "anything", secret: undefined }),
    ).resolves.toEqual({ success: true, configured: false, errorCodes: [] });
  });

  it("accepts a token Cloudflare says is good", async () => {
    const result = await verifyTurnstile({
      token: "good",
      secret: "s",
      fetchImpl: respondWith({ success: true }),
    });
    expect(result).toEqual({ success: true, configured: true, errorCodes: [] });
  });

  it("rejects a token Cloudflare says is bad, and keeps the reason for the log", async () => {
    const result = await verifyTurnstile({
      token: "bad",
      secret: "s",
      fetchImpl: respondWith({ success: false, "error-codes": ["invalid-input-response"] }),
    });
    expect(result.success).toBe(false);
    expect(result.errorCodes).toEqual(["invalid-input-response"]);
  });

  it("rejects an empty token without calling Cloudflare at all", async () => {
    const fetchImpl = respondWith({ success: true });
    const result = await verifyTurnstile({ token: "", secret: "s", fetchImpl });
    expect(result.success).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("⚠️ FAILS CLOSED when the verification call throws", async () => {
    const result = await verifyTurnstile({
      token: "good",
      secret: "s",
      fetchImpl: (() => {
        throw new Error("network down");
      }) as unknown as typeof fetch,
    });
    expect(result.success).toBe(false);
    expect(result.configured).toBe(true);
  });

  it("⚠️ FAILS CLOSED on a non-200 from Cloudflare", async () => {
    const result = await verifyTurnstile({
      token: "good",
      secret: "s",
      fetchImpl: respondWith({}, false),
    });
    expect(result.success).toBe(false);
    expect(result.errorCodes).toEqual(["http-500"]);
  });

  it("sends the remote IP when it has one", async () => {
    const fetchImpl = respondWith({ success: true });
    await verifyTurnstile({
      token: "good",
      secret: "s",
      remoteIp: "203.0.113.9",
      fetchImpl,
    });
    const body = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0]![1]!.body as URLSearchParams;
    expect(body.get("remoteip")).toBe("203.0.113.9");
  });
});
