import type { Page, Route } from "playwright";

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
  | { ok: false; reason: "NAV_TIMEOUT" | "NAV_FAILED" | "HTTP_ERROR"; status: number | null };

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
): Promise<NavigationOutcome> {
  try {
    const response = await page.goto(url, {
      waitUntil: "commit",
      timeout: budget.navTimeoutMs,
    });

    if (!response) return { ok: false, reason: "NAV_FAILED", status: null };

    const status = response.status();
    // 4xx/5xx is a real answer about the site, and it is NOT scannable content.
    if (status >= 400) return { ok: false, reason: "HTTP_ERROR", status };

    const settled = await settle(page, budget.settleMaxMs);
    return { ok: true, status, settled };
  } catch (error) {
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
