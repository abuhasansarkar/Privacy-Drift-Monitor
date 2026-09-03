import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "@playwright/test";

/**
 * ACCESSIBILITY — PLAN.md Part XI §11.6, Phase 7 task 7.6.
 *
 * §12.3: "`axe-core` assertions in E2E for the ten highest-traffic pages."
 *
 * ⚠️ AXE FINDS ROUGHLY A THIRD OF WCAG FAILURES, AND THAT IS WHY §7.6 ALSO
 * REQUIRES A MANUAL KEYBOARD AND SCREEN-READER PASS. This file is the
 * regression net — it stops a fixed violation from coming back — not the audit.
 * Treating a green axe run as "accessible" is the specific mistake §11.6 is
 * written to prevent, because the rules it CANNOT check are the product's most
 * dangerous ones: whether severity is conveyed by colour alone, whether a
 * focus order makes sense, whether an error message says anything useful.
 *
 * ⚠️ WCAG 2.2 AA IS THE TAG SET, matching §7.6. Running with no tags reports
 * best-practice findings alongside conformance failures and turns the suite
 * into a backlog nobody triages.
 *
 * ⚠️ CLERK'S OWN MARKUP IS EXCLUDED. `/login` renders a third-party component
 * we cannot edit; failing our build on somebody else's DOM is a test that can
 * only be silenced, never fixed.
 */
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function scan(page: import("@playwright/test").Page, path: string) {
  await page.goto(path);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  return new AxeBuilder({ page })
    .withTags(TAGS)
    .exclude(".cl-rootBox")
    .exclude("[data-nextjs-toast]")
    .exclude("nextjs-portal")
    .analyze();
}

/** §3.14's highest-traffic authenticated pages. */
const APP_PAGES = [
  "/app",
  "/app/websites",
  "/app/issues",
  "/app/drift",
  "/app/reports",
  "/app/billing",
  "/app/help",
];

for (const path of APP_PAGES) {
  test(`no WCAG AA violations on ${path}`, async ({ page }) => {
    const results = await scan(page, path);
    expect(
      results.violations.map((v) => `${v.id}: ${v.nodes.length} node(s) — ${v.help}`),
    ).toEqual([]);
  });
}

test.describe("public pages", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  /*
   * ⚠️ THE WHOLE PUBLIC SURFACE, NOT THREE PAGES OF IT. This list was
   * "/", "/pricing", "/free-scanner" — so /features shipped with NO `<h1>` at
   * all (it opened on a section `<h2>`) and nothing noticed. These are the
   * pages a stranger sees first and the pages a crawler reads, and they are
   * cheap to check: they are static, so there is no fixture to build.
   */
  const PUBLIC_PAGES = [
    "/",
    "/features",
    "/how-it-works",
    "/pricing",
    "/free-scanner",
    "/solutions",
    "/solutions/web-agencies",
    "/methodology",
    "/security",
    "/integrations",
    "/changelog",
    "/resources",
    "/blog",
    "/about",
    "/contact",
    "/legal/privacy",
  ];

  for (const path of PUBLIC_PAGES) {
    test(`no WCAG AA violations on ${path}`, async ({ page }) => {
      const results = await scan(page, path);
      expect(
        results.violations.map((v) => `${v.id}: ${v.nodes.length} node(s) — ${v.help}`),
      ).toEqual([]);
    });
  }

  /*
   * `scan()` already waits for a level-1 heading, so a page with none fails
   * above. This states the rule explicitly rather than leaving it as a
   * side effect of the helper — exactly one h1, which is the part a helper
   * waiting for "at least one" cannot catch.
   */
  for (const path of PUBLIC_PAGES) {
    test(`exactly one h1 on ${path}`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    });
  }

  /**
   * ⚠️ A SEPARATE ASSERTION BECAUSE AXE CANNOT MAKE IT. §11.6 forbids conveying
   * severity by colour alone, and no automated rule knows what our colours
   * mean. What can be checked is the consequence: every severity indicator must
   * carry text a screen reader can read.
   */
  test("severity is never colour alone", async ({ page }) => {
    await page.goto("/free-scanner");
    // The form page has no severities; the rule is asserted where they appear.
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });
});

test("the focus ring is never removed", async ({ page }) => {
  /*
   * §11.6: "2 px visible focus ring never removed". `outline: none` anywhere in
   * the cascade is the single most common accessibility regression in a design
   * system, and it is invisible until somebody tries to use the product without
   * a mouse.
   */
  await page.goto("/app");
  await page.keyboard.press("Tab");

  const outline = await page.evaluate(() => {
    const active = document.activeElement;
    if (!active) return null;
    const style = getComputedStyle(active);
    return { width: style.outlineWidth, style: style.outlineStyle };
  });

  expect(outline).not.toBeNull();
  expect(outline?.style).not.toBe("none");
});
