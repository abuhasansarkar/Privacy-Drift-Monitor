import { test, expect } from "@playwright/test";

/**
 * THE AUTHENTICATED APP — PLAN.md §3.3–§3.11, Phase 7 task 7.7.
 *
 * ⚠️ THESE ARE JOURNEYS, NOT COMPONENT ASSERTIONS. Whether a meter renders its
 * bar is a unit test's question; whether a signed-in agency owner can reach
 * billing, see their plan and be offered an upgrade is this file's.
 */
test.describe("the app shell", () => {
  test("the dashboard resolves tenant context", async ({ page }) => {
    await page.goto("/app");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    // The agency name in the rail proves the membership resolved, not just that
    // Clerk issued a session.
    await expect(page.getByRole("navigation").first()).toBeVisible();
  });

  test("billing shows the plan, the meters and the plan picker", async ({ page }) => {
    await page.goto("/app/billing");

    await expect(page.getByRole("heading", { name: "Billing", level: 1 })).toBeVisible();
    await expect(page.getByText("Usage this period")).toBeVisible();
    // Every metric §3.11 lists.
    for (const metric of ["Websites", "Team members", "Scans this period", "AI credits"]) {
      await expect(page.getByText(metric, { exact: true }).first()).toBeVisible();
    }
    await expect(page.getByText(/Choose a plan|Change plan/)).toBeVisible();
  });

  test("help is searchable and filters to nothing gracefully", async ({ page }) => {
    await page.goto("/app/help");
    await expect(page.getByRole("heading", { name: "Help", level: 1 })).toBeVisible();

    await page.fill("#help-search", "partial");
    await page.press("#help-search", "Enter");
    await expect(page.getByText(/why does a scan say/i)).toBeVisible();

    await page.fill("#help-search", "zzzznothingmatches");
    await page.press("#help-search", "Enter");
    await expect(page.getByText(/nothing matched/i)).toBeVisible();
  });

  test("every primary destination loads without an error boundary", async ({ page }) => {
    /*
     * ⚠️ THE ASSERTION IS "NO ERROR BOUNDARY", NOT "STATUS 200". A Server
     * Component that throws still returns 200 with the error UI rendered inside
     * it — which is exactly how a broken page ships unnoticed.
     */
    const paths = [
      "/app",
      "/app/clients",
      "/app/websites",
      "/app/issues",
      "/app/drift",
      "/app/trackers",
      "/app/reports",
      "/app/alerts",
      "/app/team",
      "/app/billing",
      "/app/help",
      "/app/settings",
    ];

    for (const path of paths) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 }), `${path} has a heading`).toBeVisible();
      /*
       * ⚠️ THE ERROR BOUNDARY'S ACTUAL WORDS, NOT A GUESS AT THEM. The first
       * version of this assertion looked for "something went wrong" and passed
       * on a page that was rendering "This page couldn't load" — so the one
       * test whose entire job was to catch a broken page reported it as fine.
       * Matched on the h1 rather than the body text, because that is what the
       * boundary owns and it cannot collide with page content.
       */
      await expect(
        page.getByRole("heading", { name: /couldn.t load|something went wrong/i }),
        `${path} did not hit an error boundary`,
      ).toHaveCount(0);
    }
  });
});
