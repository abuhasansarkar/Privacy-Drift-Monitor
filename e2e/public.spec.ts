import { test, expect } from "@playwright/test";

/**
 * THE PUBLIC SURFACE — PLAN.md §3.2, Phase 7 task 7.7.
 *
 * ⚠️ THESE RUN WITHOUT A SESSION, and the config's storageState is overridden
 * for exactly that reason: half of what matters on these pages is that they
 * work for somebody who has never signed in. A suite that visited them
 * authenticated would never notice that `/pricing` had become dynamic.
 */
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("marketing", () => {
  test("pricing shows all four plans and switches currency", async ({ page }) => {
    await page.goto("/pricing");

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    for (const price of ["$49", "$149", "$349", "$799"]) {
      await expect(page.getByText(price, { exact: false }).first()).toBeVisible();
    }

    // §9.3: the currency toggle is display-only, and the prices must actually
    // change — a selector that changes nothing is worse than no selector.
    await page.getByLabel(/currency/i).selectOption("gbp");
    await expect(page.getByText("£39", { exact: false }).first()).toBeVisible();
  });

  test("the annual toggle changes the price and shows the saving", async ({ page }) => {
    await page.goto("/pricing");
    await page.getByRole("button", { name: "Annual", exact: true }).click();
    await expect(page.getByText(/2 months free/i).first()).toBeVisible();
  });

  test("the free scanner rejects an address it must not fetch", async ({ page }) => {
    /*
     * ⚠️ THE MESSAGE MUST STAY VAGUE. Feature doc 18: every other error is
     * specific and helpful; this one is not, because a precise SSRF error turns
     * the endpoint into a network-probing oracle.
     */
    await page.goto("/free-scanner");
    await page.fill("#free-scan-url", "https://localtest.me/");
    await page.getByRole("button", { name: /scan this website/i }).click();

    /*
     * ⚠️ SCOPED TO THE FORM. Next renders its own `<div role="alert">` route
     * announcer on every page, so a bare `getByRole("alert")` is a strict-mode
     * violation that resolves to two elements — one of which is always empty.
     */
    const alert = page.locator("form").locator("..").getByRole("alert").first();
    await expect(alert).toBeVisible();
    await expect(alert).toContainText("can't scan this address");
    // It must not name the reason, the resolved address, or the rule.
    await expect(alert).not.toContainText(/127\.0\.0\.1|private|loopback/i);
  });

  test("legal, resources, blog, changelog and contact all render", async ({ page }) => {
    for (const path of ["/legal/disclaimer", "/resources", "/blog", "/changelog", "/about", "/contact"]) {
      const response = await page.goto(path);
      expect(response?.status(), `${path} responded`).toBe(200);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    }
  });

  test("a blog post is statically routable and carries Article JSON-LD", async ({ page }) => {
    await page.goto("/blog/what-privacy-drift-is");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    const jsonLd = await page.locator('script[type="application/ld+json"]').first().textContent();
    expect(JSON.parse(jsonLd ?? "{}")["@type"]).toBe("Article");
  });

  test("the app redirects an unauthenticated visitor to sign in", async ({ page }) => {
    await page.goto("/app");
    await expect(page).toHaveURL(/\/login/);
  });
});

/**
 * SECURITY HEADERS — PLAN.md Part X §10.1, Phase 7 task 7.1.
 *
 * ⚠️ ASSERTED IN E2E RATHER THAN IN A UNIT TEST, because the thing that can go
 * wrong is not the header-building function — it is the header never reaching
 * the browser. A proxy matcher that stops matching, a route group that bypasses
 * it, a response constructed somewhere else: all of those produce a correct
 * function and an unprotected page.
 */
test.describe("security headers", () => {
  const REQUIRED = {
    "x-frame-options": "DENY",
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
  };

  /*
   * ⚠️ INCLUDING `/app` AND `/admin`, WHICH REDIRECT WHEN SIGNED OUT. That is
   * the case that found the bug: Clerk answers `auth.protect()` with its own
   * 307 before the proxy body runs, so headers set there were missing from
   * every unauthenticated bounce. They come from `next.config.ts` now, which
   * Next applies to that redirect too.
   */
  for (const path of ["/", "/pricing", "/app", "/admin"]) {
    test(`${path} carries the §10.1 headers`, async ({ request }) => {
      const response = await request.get(path, { maxRedirects: 0 });
      const headers = response.headers();

      for (const [name, value] of Object.entries(REQUIRED)) {
        expect(headers[name], `${path} ${name}`).toBe(value);
      }
      expect(headers["permissions-policy"]).toContain("camera=()");
    });
  }

  for (const path of ["/", "/pricing"]) {
    test(`${path} carries a CSP that stops the three classic attacks`, async ({
      request,
    }) => {
      // Asserted on rendered documents only — a 307 has no document to protect,
      // and its CSP would govern nothing.
      const csp = (await request.get(path)).headers()["content-security-policy"] ?? "";
      expect(csp, "clickjacking").toContain("frame-ancestors 'none'");
      expect(csp, "plugin content").toContain("object-src 'none'");
      expect(csp, "base tag injection").toContain("base-uri 'self'");
    });
  }

  test("⚠️ THE AUTHENTICATED SURFACE GETS A NONCE, THE STATIC ONE DOES NOT", async ({
    request,
  }) => {
    /*
     * The split is deliberate and explained at length in `src/proxy.ts`: a
     * nonce forces dynamic rendering, and §3.2 requires the marketing pages to
     * be prerendered. This asserts the split is the way round it is meant to
     * be — the pages that render tenant data are the ones with the strict
     * policy. Getting it backwards would be silent.
     */
    // `/login` is dynamic and renders a document without a session, so it is
    // the authenticated-surface policy observable from an anonymous test.
    const dynamic = await request.get("/login");
    expect(dynamic.headers()["content-security-policy"]).toContain("'nonce-");

    const staticPage = await request.get("/pricing");
    const staticCsp = staticPage.headers()["content-security-policy"] ?? "";
    expect(staticCsp).not.toContain("'nonce-");
    // And it must never fall back to allowing everything.
    expect(staticCsp).toContain("default-src 'self'");
  });
});
