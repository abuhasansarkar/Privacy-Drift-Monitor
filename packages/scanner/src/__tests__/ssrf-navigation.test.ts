import { describe, expect, it, vi } from "vitest";
import type { Page, Request, Route } from "playwright";
import { DEFAULT_BUDGET, installRouteGuard, navigate } from "../navigate";
import { MAX_REDIRECT_HOPS, SsrfBlockedError } from "../net/guard";

/**
 * SSRF ENFORCEMENT AT NAVIGATION TIME — PLAN.md §10.3 R4/R5, AGENTS.md
 * ("SSRF guard on every navigation **and every redirect hop**").
 *
 * ⚠️ THIS SUITE EXISTS BECAUSE THE GUARD WAS NOT WIRED IN. `assertSafeRedirect`
 * and `MAX_REDIRECT_HOPS` were written, exported and tested in Phase 2 — and
 * had NO CALL SITE anywhere in the scanner. The guard ran once, in the web app,
 * when a URL was submitted; nothing checked the address the browser actually
 * went to. Both attacks below were live:
 *
 *   R4 — DNS rebinding: `attacker.com` resolves public at submission and
 *        private a second later when Chromium resolves it again.
 *   R5 — Redirect: a perfectly public host answers 302 to `http://127.0.0.1:6379/`.
 *
 * The free public scanner (§3.2) turns both from "an authenticated customer
 * could probe our network" into "anyone on the internet can", which is why they
 * were found and fixed in the same phase.
 *
 * ⚠️ A UNIT SUITE, NOT A BROWSER ONE. Making real Chromium resolve a rebinding
 * DNS record on demand is not something a test can do deterministically; what
 * must be asserted is that the route handler CALLS the guard for every
 * navigation request and aborts when it throws.
 */

type Handler = (route: Route) => Promise<void> | void;

/** A fake page that captures the route handler and lets a test drive it. */
function fakePage() {
  let handler: Handler | null = null;
  return {
    page: {
      route: vi.fn(async (_pattern: string, fn: Handler) => {
        handler = fn;
      }),
    } as unknown as Page,
    dispatch: (route: Route) => handler!(route),
  };
}

function fakeRoute(options: {
  url: string;
  isNavigation?: boolean;
  redirectDepth?: number;
  resourceType?: string;
}) {
  const abort = vi.fn(async () => undefined);
  const continue_ = vi.fn(async () => undefined);

  let chain: Request | null = null;
  for (let index = 0; index < (options.redirectDepth ?? 0); index += 1) {
    const previous: Request | null = chain;
    chain = { redirectedFrom: () => previous } as unknown as Request;
  }

  const request = {
    url: () => options.url,
    isNavigationRequest: () => options.isNavigation ?? true,
    resourceType: () => options.resourceType ?? "document",
    redirectedFrom: () => chain,
  } as unknown as Request;

  return {
    abort,
    continue_,
    route: { request: () => request, abort, continue: continue_ } as unknown as Route,
  };
}

const ALLOW = vi.fn(async () => undefined);
const BLOCK = vi.fn(async () => {
  throw new SsrfBlockedError("PRIVATE_ADDRESS" as never, "127.0.0.1");
});

describe("installRouteGuard", () => {
  it("lets an allowed navigation through", async () => {
    const { page, dispatch } = fakePage();
    const onBlocked = vi.fn();
    await installRouteGuard(page, { blockMedia: false, guard: ALLOW, onBlocked });

    const { route, continue_ } = fakeRoute({ url: "https://example.com/" });
    await dispatch(route);

    expect(continue_).toHaveBeenCalled();
    expect(onBlocked).not.toHaveBeenCalled();
  });

  it("⚠️ ABORTS A NAVIGATION THE GUARD REFUSES", async () => {
    const { page, dispatch } = fakePage();
    const onBlocked = vi.fn();
    await installRouteGuard(page, { blockMedia: false, guard: BLOCK, onBlocked });

    const { route, abort, continue_ } = fakeRoute({ url: "http://127.0.0.1:6379/" });
    await dispatch(route);

    expect(abort).toHaveBeenCalledWith("blockedbyclient");
    expect(continue_).not.toHaveBeenCalled();
    expect(onBlocked).toHaveBeenCalled();
  });

  it("⚠️ CHECKS EVERY REDIRECT HOP, not just the first navigation", async () => {
    /*
     * R5. Playwright follows redirects inside `goto()`; each hop arrives at the
     * route handler as a new navigation request with `redirectedFrom()` set. A
     * guard that only ran on the original URL would never see the address the
     * browser actually fetched.
     */
    const { page, dispatch } = fakePage();
    const onBlocked = vi.fn();
    await installRouteGuard(page, { blockMedia: false, guard: BLOCK, onBlocked });

    const { route, abort } = fakeRoute({
      url: "http://169.254.169.254/latest/meta-data/",
      redirectDepth: 1,
    });
    await dispatch(route);

    expect(abort).toHaveBeenCalledWith("blockedbyclient");
  });

  it("stops a redirect loop at the hop limit before it burns a browser slot", async () => {
    const { page, dispatch } = fakePage();
    const onBlocked = vi.fn();
    await installRouteGuard(page, { blockMedia: false, guard: ALLOW, onBlocked });

    const { route, abort } = fakeRoute({
      url: "https://loop.example.com/",
      redirectDepth: MAX_REDIRECT_HOPS + 1,
    });
    await dispatch(route);

    expect(abort).toHaveBeenCalledWith("blockedbyclient");
    expect(onBlocked).toHaveBeenCalledWith(
      "https://loop.example.com/",
      "TOO_MANY_REDIRECTS",
    );
  });

  it("⚠️ DOES NOT GUARD SUBRESOURCES — a private-address image is EVIDENCE", async () => {
    /*
     * Blocking it would change the site's observed behaviour and hide a
     * finding. What must never happen is that WE follow the browser somewhere
     * private and treat the response as content to scan — which is a
     * NAVIGATION, and is what the cases above cover.
     */
    const { page, dispatch } = fakePage();
    const guard = vi.fn(async () => undefined);
    await installRouteGuard(page, { blockMedia: false, guard, onBlocked: vi.fn() });

    const { route, continue_ } = fakeRoute({
      url: "http://10.0.0.5/pixel.gif",
      isNavigation: false,
      resourceType: "image",
    });
    await dispatch(route);

    expect(guard).not.toHaveBeenCalled();
    expect(continue_).toHaveBeenCalled();
  });

  it("still blocks media in the same handler — one handler does both jobs", async () => {
    // Playwright dispatches to the most recently registered matching handler
    // and does not chain; two `page.route("**​/*")` registrations mean one of
    // them silently never runs, and it would be the security control.
    const { page, dispatch } = fakePage();
    await installRouteGuard(page, {
      blockMedia: true,
      guard: ALLOW,
      onBlocked: vi.fn(),
    });

    const { route, abort } = fakeRoute({
      url: "https://example.com/clip.mp4",
      isNavigation: false,
      resourceType: "media",
    });
    await dispatch(route);

    expect(abort).toHaveBeenCalledWith();
  });
});

describe("navigate", () => {
  it("⚠️ REFUSES BEFORE PLAYWRIGHT IS EVER CALLED", async () => {
    // A bad scheme or a blocked port never reaches the route handler at all —
    // `goto("file:///etc/passwd")` fails inside Playwright with a message that
    // says nothing about why. The entry check is what makes it SSRF_BLOCKED.
    const goto = vi.fn();
    const page = { goto } as unknown as Page;

    const outcome = await navigate(page, "file:///etc/passwd", DEFAULT_BUDGET, {
      guard: BLOCK,
    });

    expect(outcome).toEqual({ ok: false, reason: "SSRF_BLOCKED", status: null });
    expect(goto).not.toHaveBeenCalled();
  });

  it("reports SSRF_BLOCKED when a hop was refused mid-navigation", async () => {
    // The route handler aborted a redirect; `goto` then rejects or returns
    // null. Without `blocked()` this reads as NAV_FAILED — "we could not reach
    // your site" — which is both wrong and hides an attempted probe.
    const page = {
      goto: vi.fn(async () => {
        throw new Error("net::ERR_BLOCKED_BY_CLIENT");
      }),
    } as unknown as Page;

    const outcome = await navigate(page, "https://example.com/", DEFAULT_BUDGET, {
      guard: ALLOW,
      blocked: () => "PRIVATE_ADDRESS:http://127.0.0.1/",
    });

    expect(outcome).toEqual({ ok: false, reason: "SSRF_BLOCKED", status: null });
  });

  it("uses the REAL guard when none is injected — the default fails closed", async () => {
    /*
     * ⚠️ THE MOST IMPORTANT ASSERTION IN THIS FILE. `urlGuard` is injectable so
     * the fixture suite can reach 127.0.0.1; if the default were permissive,
     * every production path that forgot the parameter would silently have no
     * SSRF protection — which is exactly the state this phase found the
     * scanner in.
     */
    const goto = vi.fn();
    const page = { goto } as unknown as Page;

    const outcome = await navigate(page, "http://127.0.0.1:8080/", DEFAULT_BUDGET);

    expect(outcome).toEqual({ ok: false, reason: "SSRF_BLOCKED", status: null });
    expect(goto).not.toHaveBeenCalled();
  });
});
