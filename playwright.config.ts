import { defineConfig, devices } from "@playwright/test";

/**
 * E2E — PLAN.md Part XII §12.3 (Phase 7 task 7.7), §12.2.
 *
 * ⚠️ SEPARATE FROM VITEST, AND NOT AN ACCIDENT OF TOOLING. The vitest suite
 * asserts logic against a real database with no browser; this asserts that a
 * PERSON can complete a journey through the deployed app. They fail for
 * different reasons and neither substitutes for the other — 930 green unit
 * tests said nothing about whether the admin panel rendered, which is why the
 * §3.12 pages were verified by hand before this file existed.
 *
 * ⚠️ IT RUNS AGAINST A DEV SERVER THE CONFIG STARTS ITSELF, reusing one that
 * is already up. A suite that assumes a server is running is a suite that fails
 * in CI for a reason that has nothing to do with the code.
 *
 * ⚠️ ONE WORKER, NO PARALLELISM. Every spec shares one database and one Clerk
 * account; two workers signing in as the same user race on the session, and two
 * workers mutating the same agency race on everything else. This suite is about
 * correctness of journeys, not wall-clock.
 */
const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  // A cold Next dev compile of a route can genuinely take this long.
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    /*
     * ⚠️ THE SETUP PROJECT SIGNS IN ONCE AND SAVES THE SESSION. Signing in per
     * spec would mean a Clerk sign-in flow — including its device-verification
     * step — for every test, which is slow and makes the suite depend on
     * Clerk's uptime far more than it needs to.
     */
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/user.json" },
      dependencies: ["setup"],
    },
  ],
  webServer: {
    command: "npm run dev",
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
