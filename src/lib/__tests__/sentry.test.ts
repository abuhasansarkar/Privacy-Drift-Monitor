import { afterEach, describe, expect, it, vi } from "vitest";
import { sentryConfigured, sentryOptions } from "../sentry";

/**
 * SENTRY REDACTION — PLAN.md Part X §10.6, §10.8, Phase 7 task 7.3.
 *
 * ⚠️ THE ASSERTIONS ARE ABOUT WHAT MUST NOT LEAVE THE PROCESS. A privacy
 * product that ships its customers' data — or their clients' data — to an error
 * reporter has failed at the thing it sells. An error thrown inside the
 * recorder carries request URLs and cookie names belonging to somebody else's
 * website, and none of that is ours to hand to a third party for debugging.
 */

afterEach(() => vi.unstubAllEnvs());

describe("sentryOptions", () => {
  it("⚠️ IS NULL WITH NO DSN — a half-configured reporter looks like coverage", () => {
    vi.stubEnv("SENTRY_DSN", "");
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "");
    expect(sentryOptions()).toBeNull();
    expect(sentryConfigured()).toBe(false);
  });

  it("initialises when a DSN is set", () => {
    vi.stubEnv("SENTRY_DSN", "https://key@example.ingest.sentry.io/1");
    expect(sentryOptions()?.dsn).toContain("sentry.io");
    expect(sentryConfigured()).toBe(true);
  });

  it("never sends default PII", () => {
    // Turning this on attaches IP addresses and user identifiers to every
    // event; §10.6 hashes IPs everywhere else in this codebase.
    vi.stubEnv("SENTRY_DSN", "https://key@example.ingest.sentry.io/1");
    expect(sentryOptions()?.sendDefaultPii).toBe(false);
  });
});

describe("beforeSend", () => {
  /**
   * ⚠️ CAST THROUGH `unknown`, NOT `any`. Sentry's `Event` type is structurally
   * enormous and each case here builds two or three fields; spelling it out
   * would bury the assertion. Going via `unknown` satisfies the compiler
   * without disabling the `no-explicit-any` rule for the whole file.
   *
   * ⚠️ `beforeSend` IS TYPED AS POSSIBLY ASYNC. Ours is synchronous, and the
   * cast below says so — an `await` here would hide a future change to that.
   */
  type Scrubbed = Record<string, Record<string, unknown>>;

  function send(event: Record<string, unknown>): Scrubbed {
    vi.stubEnv("SENTRY_DSN", "https://key@example.ingest.sentry.io/1");
    const options = sentryOptions();
    const result = options!.beforeSend!(event as never, {} as never);
    return result as unknown as Scrubbed;
  }

  it("⚠️ DROPS THE QUERY STRING, which carries bearer tokens", () => {
    /*
     * `/free-scanner/<32-byte token>` and `/reports/shared/<token>` both put a
     * credential in the URL by design — the token IS the authorisation. An
     * error report containing one hands that credential to whoever can read
     * the report.
     */
    const event = send({ request: { query_string: "token=secret-bearer-value" } });
    expect(event.request.query_string).toBe("[redacted]");
  });

  it("drops cookies and redacts sensitive headers", () => {
    const event = send({
      request: {
        cookies: { session: "abc" },
        headers: { authorization: "Bearer x", "user-agent": "Chrome" },
      },
    });
    expect(event.request.cookies).toBe("[redacted]");
    const headers = event.request.headers as Record<string, string>;
    expect(headers.authorization).toBe("[redacted]");
    // Harmless context survives — a report with everything redacted is useless.
    expect(headers["user-agent"]).toBe("Chrome");
  });

  it("⚠️ REDACTS SCANNED-SITE DATA, which is the one nobody expects", () => {
    const event = send({
      extra: {
        scan: { cookieValue: "_ga=GA1.2", valueHash: "sha256:x", evidence: { a: 1 } },
        websiteId: "keep-me",
      },
    });
    const scan = event.extra.scan as Record<string, unknown>;
    expect(scan.cookieValue).toBe("[redacted]");
    expect(scan.valueHash).toBe("[redacted]");
    expect(scan.evidence).toBe("[redacted]");
    expect(event.extra.websiteId).toBe("keep-me");
  });

  it("keeps the key and replaces the value", () => {
    // Dropping the key would make a report claim the field was absent, which
    // sends whoever is debugging down the wrong path.
    const event = send({ extra: { apiKey: "sk-live-1" } });
    expect(Object.keys(event.extra)).toContain("apiKey");
    expect(event.extra.apiKey).toBe("[redacted]");
  });

  it("does not recurse without bound", () => {
    // A cyclic object in `extra` would hang the reporter, which then hangs the
    // request it was trying to report on.
    const deep: Record<string, unknown> = {};
    let node = deep;
    for (let i = 0; i < 40; i += 1) {
      node.next = {};
      node = node.next as Record<string, unknown>;
    }
    expect(() => send({ extra: deep })).not.toThrow();
  });
});
