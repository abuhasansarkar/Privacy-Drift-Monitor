import type { Page, Request, Route } from "playwright";
import { MAX_REDIRECT_HOPS, assertSafeUrl, SsrfBlockedError } from "./net/guard";

/**
 * NAVIGATION, SETTLE, OBSERVATION — PLAN.md Part IV §4.3, Phase 2 tasks 2.4/2.5.
 *
 * The shape of a phase's page visit, and the timing decisions behind it. Every
 * budget here is a deliberate trade between catching late behaviour and burning
 * the scarcest resource in the system (browser time), so none of them should be
 * changed without knowing which side you are trading away.
 */

export interface NavigationBudget {
  /** Hard cap on the initial navigation. */
  navTimeoutMs: number;
  /** How long to wait for the network to go quiet before giving up on quiet. */
  settleMaxMs: number;
  /** How long to keep watching AFTER settle, for deferred tags. */
  observeMs: number;
}

export const DEFAULT_BUDGET: NavigationBudget = {
  navTimeoutMs: 30_000,
  settleMaxMs: 15_000,
  observeMs: 10_000,
};

export type NavigationOutcome =
  | { ok: true; status: number; settled: boolean }
  | {
      ok: false;
      reason: "NAV_TIMEOUT" | "NAV_FAILED" | "HTTP_ERROR" | "SSRF_BLOCKED";
      status: number | null;
    };

/**
 * Validates a URL we are about to navigate to. Defaults to the real guard.
 *
 * ⚠️ INJECTABLE ONLY SO THE FIXTURE SUITE CAN RUN. Every fixture in §4.15 is
 * served from `127.0.0.1`, which the guard blocks by design and must keep
 * blocking. Production paths never pass this — the default is the guard, so
 * forgetting the parameter fails CLOSED.
 */
export type UrlGuard = (url: string) => Promise<unknown>;

/** Allows anything. **Fixture tests only** — never reachable from a real scan. */
export const allowAnyUrl: UrlGuard = async () => undefined;

/**
 * SSRF ENFORCEMENT AT NAVIGATION TIME — PLAN.md Part X §10.3 R4/R5,
 * AGENTS.md ("SSRF guard on every navigation **and every redirect hop**").
 *
 * ⚠️ VALIDATING ONCE AT SUBMISSION IS NOT ENOUGH, AND THE TWO REASONS ARE BOTH
 * REAL ATTACKS:
 *
 *   R4 — DNS REBINDING. `attacker.com` resolves to a public address when the
 *        web app validates it and to `169.254.169.254` a second later when the
 *        browser resolves it again. The submission check cannot prevent this;
 *        only re-resolving at the moment of navigation can.
 *   R5 — REDIRECTS. `attacker.com` is a perfectly good public host that answers
 *        302 to `http://127.0.0.1:6379/`. Playwright follows redirects inside
 *        `goto()`, so without a per-hop check the guard never sees the address
 *        that is actually fetched.
 *
 * ⚠️ THIS RUNS ON NAVIGATION REQUESTS ONLY, NOT SUBRESOURCES. A page that loads
 * an image from a private address is EVIDENCE — recording it is the product's
 * job, and blocking it would both change the site's observed behaviour and hide
 * a finding. What must never happen is that WE follow the browser somewhere
 * private and treat the response as content to scan.
 *
 * ⚠️ IT SHARES ONE ROUTE HANDLER WITH MEDIA BLOCKING. Playwright dispatches to
 * the most recently registered matching handler and does not chain unless the
 * handler calls `fallback()`; two separate `page.route("**​/*")` registrations
 * silently mean only one of them runs.
 */
function countRedirectHops(request: Request): number {
  let hops = 0;
  let current: Request | null = request.redirectedFrom();
  while (current) {
    hops += 1;
    current = current.redirectedFrom();
  }
  return hops;
}

export interface RouteGuardOptions {
  blockMedia: boolean;
  guard: UrlGuard;
  /** Set when a navigation was refused, so `navigate()` can report the reason. */
  onBlocked: (url: string, reason: string) => void;
}

export async function installRouteGuard(
  page: Page,
  options: RouteGuardOptions,
): Promise<void> {
  await page.route("**/*", async (route: Route) => {
    const request = route.request();

    if (request.isNavigationRequest()) {
      /*
       * ⚠️ THE HOP LIMIT IS CHECKED BEFORE THE ADDRESS. An infinite redirect
       * loop between two public hosts never trips the address check and would
       * hold a browser slot until the navigation timeout — which, multiplied by
       * the free scanner's anonymous submitters, is a denial of service against
       * our own pool.
       */
      if (countRedirectHops(request) > MAX_REDIRECT_HOPS) {
        options.onBlocked(request.url(), "TOO_MANY_REDIRECTS");
        return route.abort("blockedbyclient");
      }

      try {
        await options.guard(request.url());
      } catch (error) {
        options.onBlocked(
          request.url(),
          error instanceof SsrfBlockedError ? error.reason : "GUARD_FAILED",
        );
        return route.abort("blockedbyclient");
      }
    }

    if (options.blockMedia) {
      const type = request.resourceType();
      if (type === "media" || type === "font") return route.abort();
    }

    return route.continue();
  });
}

/**
 * Media blocking — record-then-abort (§4.4, task 2.4).
 *
 * ⚠️ THE REQUEST IS RECORDED BEFORE IT IS ABORTED. Playwright fires the
 * `request` event before the route handler runs, so the network recorder has
 * already seen it. Aborting only stops the BYTES.
 *
 * That distinction is the whole design: a video or font is evidence that the
 * request happened — which is what a tracking finding rests on — while its
 * payload is megabytes we would download, never look at, and pay for. Blocking
 * the request outright would make the site's behaviour look different from what
 * a real visitor triggers.
 */
export async function installMediaBlocking(page: Page): Promise<void> {
  await page.route("**/*", (route: Route) => {
    const type = route.request().resourceType();
    if (type === "media" || type === "font") return route.abort();
    return route.continue();
  });
}

/**
 * Navigates and reports what happened.
 *
 * `waitUntil: "commit"` rather than `load` or `networkidle`: we want control
 * back the moment the response arrives, so the settle logic below owns the
 * waiting. Handing that to Playwright would make a slow third-party script
 * indistinguishable from a slow server.
 */
export async function navigate(
  page: Page,
  url: string,
  budget: NavigationBudget = DEFAULT_BUDGET,
  options: { guard?: UrlGuard; blocked?: () => string | null } = {},
): Promise<NavigationOutcome> {
  /*
   * ⚠️ THE FIRST HOP IS CHECKED HERE AS WELL AS IN THE ROUTE HANDLER. A URL
   * with a bad scheme or a blocked port never reaches the route handler at all
   * — `goto("file:///etc/passwd")` fails inside Playwright with a message that
   * says nothing about why — so the entry check is what turns those into a
   * clean SSRF_BLOCKED rather than a generic NAV_FAILED.
   */
  const guard = options.guard ?? assertSafeUrl;
  try {
    await guard(url);
  } catch {
    return { ok: false, reason: "SSRF_BLOCKED", status: null };
  }

  try {
    const response = await page.goto(url, {
      waitUntil: "commit",
      timeout: budget.navTimeoutMs,
    });

    // A navigation the route handler refused surfaces here as a null response
    // or an aborted goto; `blocked()` distinguishes it from a dead server.
    if (options.blocked?.()) {
      return { ok: false, reason: "SSRF_BLOCKED", status: null };
    }

    if (!response) return { ok: false, reason: "NAV_FAILED", status: null };

    const status = response.status();
    // 4xx/5xx is a real answer about the site, and it is NOT scannable content.
    if (status >= 400) return { ok: false, reason: "HTTP_ERROR", status };

    const settled = await settle(page, budget.settleMaxMs);
    return { ok: true, status, settled };
  } catch (error) {
    if (options.blocked?.()) {
      return { ok: false, reason: "SSRF_BLOCKED", status: null };
    }
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      reason: message.includes("Timeout") ? "NAV_TIMEOUT" : "NAV_FAILED",
      status: null,
    };
  }
}

/**
 * Waits for the network to go quiet, and reports whether it actually did.
 *
 * ⚠️ THE RETURN VALUE MATTERS. A page that never settles (an analytics poller,
 * a websocket heartbeat — fixture F12) is common and is not a failure. But the
 * phase must know, because "we stopped watching while things were still
 * happening" is a different claim from "nothing more happened", and only the
 * second one supports "no tracker detected".
 */
export async function settle(page: Page, maxMs: number): Promise<boolean> {
  try {
    await page.waitForLoadState("networkidle", { timeout: maxMs });
    return true;
  } catch {
    return false;
  }
}

/**
 * The observation window: keep recording after settle, and scroll once.
 *
 * Two behaviours this exists to catch, both real and both invisible without it:
 *   - tags on a `setTimeout` (fixture F06)
 *   - tags bound to a scroll or interaction (fixture F07)
 *
 * The scroll is a single pass to the bottom and back. More would be a crawl,
 * and less would miss the lazy-load pattern that almost every tag manager uses.
 */
export async function observe(
  page: Page,
  budget: NavigationBudget = DEFAULT_BUDGET,
): Promise<void> {
  const deadline = Date.now() + budget.observeMs;

  // String expression: `window`/`document` need the DOM lib, which this Node
  // package deliberately does not load. See recorders.ts for the same note.
  await page
    .evaluate<void>(
      `(() => {
        window.scrollTo(0, document.body.scrollHeight);
        window.scrollTo(0, 0);
      })()`,
    )
    .catch(() => {});

  const remaining = deadline - Date.now();
  if (remaining > 0) await page.waitForTimeout(remaining);
}
