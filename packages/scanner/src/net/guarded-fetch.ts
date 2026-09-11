import { assertSafeRedirect, assertSafeUrl, SsrfBlockedError, MAX_REDIRECT_HOPS, type AssertSafeUrlOptions } from "./guard";

/**
 * SSRF-GUARDED FETCH — F-008. **SECURITY-CRITICAL.**
 *
 * Node-side `fetch()` calls in this codebase fall into two kinds. The first
 * fetches from OUR OWN infrastructure config; the second — sitemap discovery,
 * policy-audit HTML fetches, outbound webhooks — fetches from URLs that are,
 * at some hop, attacker- or tenant-controlled. For the second kind, validating
 * the ENTRY url and then letting `fetch()` follow redirects freely is not a
 * guard: `assertSafeUrl` answered for hop 0 only, and a 302 to
 * `http://169.254.169.254/…` (or any internal address) was followed
 * unguarded. `assertSafeRedirect` existed for exactly this, exported,
 * unit-tested — and called from nowhere. This is the twice-documented defect
 * shape; this helper is where it finally gets its call sites.
 *
 * ⚠️ REDIRECTS ARE FOLLOWED MANUALLY, ONE HOP AT A TIME, with the full guard
 * re-run per hop (R5) and the hop count capped (R6). The response stream is
 * never left to auto-follow, because the guard must see every URL before a
 * byte of it is requested.
 *
 * ⚠️ A SIZE CAP IS PART OF THE GUARD, not a nicety. A response that streams
 * gigabytes from an internal service is both a memory DoS against the worker
 * and an exfiltration channel. The body is read with the cap applied DURING
 * the read, not checked after the whole body is in memory.
 *
 * ⚠️ THE USER-FACING MESSAGE STAYS VAGUE (R7). Callers get `SsrfBlockedError`,
 * whose `reason`/`detail` are for the security log — never for the response.
 */

export interface GuardedFetchOptions {
  method?: "GET" | "POST" | "HEAD";
  headers?: Record<string, string>;
  /** Per-hop timeout, applied fresh to the initial request and every redirect. */
  timeoutMs?: number;
  /** Maximum response bytes. Reads abort once exceeded. Default 2 MiB. */
  maxBytes?: number;
  /** Request body — used by POST (webhook delivery). */
  body?: string;
  /** Override for tests. Defaults to the global `fetch`. */
  fetchFn?: typeof fetch;
  /**
   * ⚠️ THE SSRF GUARD ITSELF, INJECTABLE FOR FIXTURES ONLY. The §4.15 fixture
   * suite and these tests serve from 127.0.0.1, which the real guard blocks by
   * design. Omitting it uses the real guard, so a production call site that
   * forgets to pass a guard fails CLOSED. The injection replaces the guard at
   * the FUNCTION level (both `assertSafeUrl` and `assertSafeRedirect`), never
   * at the address level — a "resolver" that answers private addresses would
   * weaken the guard for every call site sharing it.
   */
  guard?: (url: string) => Promise<unknown>;
  guardOptions?: AssertSafeUrlOptions;
}

export interface GuardedFetchResult {
  /** The final URL after redirects — the one the body actually came from. */
  finalUrl: string;
  status: number;
  /** The response body, capped at `maxBytes`. */
  body: string;
  /** True when the response was truncated at `maxBytes`. */
  truncated: boolean;
}

/**
 * Reads a response body with a hard byte cap applied DURING the stream.
 */
async function readBodyCapped(
  response: Response,
  maxBytes: number,
): Promise<{ body: string; truncated: boolean }> {
  if (!response.body) {
    return { body: "", truncated: false };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: false });
  let received = 0;
  let out = "";
  let truncated = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      // Decode what fits, then stop reading. The connection is torn down by
      // cancelling the reader — leaving it open would hold a socket.
      const fitting = value.subarray(0, value.byteLength - (received - maxBytes));
      out += decoder.decode(fitting, { stream: true });
      truncated = true;
      void reader.cancel().catch(() => {});
      break;
    }
    out += decoder.decode(value, { stream: true });
  }

  if (!truncated) out += decoder.decode();
  return { body: out, truncated };
}

/**
 * Fetches `url` with the SSRF guard enforced on the entry URL and on EVERY
 * redirect hop, a per-hop timeout, and a hard response size cap.
 */
export async function guardedFetch(
  url: string,
  options: GuardedFetchOptions = {},
): Promise<GuardedFetchResult> {
  const fetchFn = options.fetchFn ?? fetch;
  const method = options.method ?? "GET";
  const timeoutMs = options.timeoutMs ?? 10_000;
  const maxBytes = options.maxBytes ?? 2 * 1024 * 1024;
  /*
   * Guard injection is FUNCTION-LEVEL, fixture-only. Default: the real guard,
   * so a production call site that omits it fails closed.
   */
  const checkUrl = options.guard ?? (async (target: string) => {
    await assertSafeUrl(target, options.guardOptions);
  });

  // Hop 0: the full entry check. `assertSafeUrl` returns the pinned target,
  // which the caller cannot yet connect to directly (undici has no per-request
  // dial override) — the residual DNS-rebinding TOCTOU is documented at the
  // call sites and mitigated by the egress firewall layer (§10.3's layer 2).
  await checkUrl(url);

  let currentUrl = url;
  let hop = 0;

  while (true) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetchFn(currentUrl, {
        method,
        redirect: "manual",
        headers: options.headers,
        body: method === "POST" ? options.body : undefined,
        signal: controller.signal,
      });
    } catch (error) {
      clearTimeout(timer);
      throw error;
    }
    clearTimeout(timer);

    // 3xx: validate the target BEFORE following it. The per-hop check goes
    // through the SAME injected guard as hop 0 — an allow-any fixture guard
    // covers redirects too. With the real guard this is the full
    // `assertSafeRedirect` (relative resolution, hop limit, address checks).
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) {
        // A redirect with nowhere to go: treat the response itself as final.
        return { finalUrl: currentUrl, status: response.status, body: "", truncated: false };
      }

      const absolute = new URL(location, currentUrl).toString();
      if (options.guard) {
        await options.guard(absolute);
      } else {
        await assertSafeRedirect(location, currentUrl, hop);
      }
      // Drain and close the redirect response so the socket is released.
      void response.body?.cancel().catch(() => {});
      currentUrl = absolute;
      hop += 1;
      if (hop > MAX_REDIRECT_HOPS) {
        throw new SsrfBlockedError(
          "REDIRECT_LIMIT",
          `${hop} redirects exceed ${MAX_REDIRECT_HOPS}`,
        );
      }
      continue;
    }

    const { body, truncated } = await readBodyCapped(response, maxBytes);
    return { finalUrl: currentUrl, status: response.status, body, truncated };
  }
}
