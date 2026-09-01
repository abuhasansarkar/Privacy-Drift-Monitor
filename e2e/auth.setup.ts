import { test as setup, expect } from "@playwright/test";

/**
 * SIGN IN ONCE — PLAN.md Phase 7 task 7.7.
 *
 * ⚠️ CLERK TEST MODE IS WHAT MAKES THIS POSSIBLE WITHOUT A MAILBOX. An email
 * address containing `+clerk_test` accepts the fixed verification code `424242`
 * on a development instance. Without it, an E2E suite against a Clerk app needs
 * either a real inbox or a mocked auth layer — and a mocked auth layer means
 * the one thing E2E exists to prove (that a real person can get in) is the one
 * thing it does not test.
 *
 * ⚠️ THE ACCOUNT IS PROVISIONED OUT OF BAND, NOT BY THIS FILE. It needs a Clerk
 * user, a Clerk organization and a membership, which is Backend API work rather
 * than browser work — `scripts/e2e-account.ts` does it and is idempotent.
 *
 * ⚠️ "Continue" IS PRESSED WITH `Enter`, NOT BY ROLE. Clerk's sign-in card has
 * a "Sign in with Google" button that also matches `{ name: /continue/i }` in
 * some renderings; clicking it opens Google's own sign-in and the run dies
 * thirty seconds later with a timeout that says nothing about why.
 */
const EMAIL = process.env.E2E_EMAIL ?? "pdm.e2e+clerk_test@example.com";
const PASSWORD = process.env.E2E_PASSWORD ?? "PdmE2E!verify-2026";
const STATE = "e2e/.auth/user.json";

setup("authenticate", async ({ page }) => {
  await page.goto("/login");

  await page.waitForSelector('input[name="identifier"]');
  await page.fill('input[name="identifier"]', EMAIL);
  await page.press('input[name="identifier"]', "Enter");

  await page.waitForSelector('input[name="password"]');
  await page.fill('input[name="password"]', PASSWORD);
  await page.press('input[name="password"]', "Enter");

  /*
   * Clerk asks for device verification on a fresh browser profile. On a
   * `+clerk_test` address the code is always 424242.
   *
   * ⚠️ THE SIX BOXES ARE DECORATION. Clerk renders one real
   * `input[autocomplete="one-time-code"]` and six styled `<div>`s over it, and
   * the real input is visually hidden — so `isVisible()` is FALSE for the only
   * element that accepts the code, and gating on it skips the step entirely.
   * That is what made this hang on `/login/client-trust`: the password had been
   * accepted, the code was never entered, and the URL never left `/login`.
   *
   * `fill({ force: true })` is therefore correct rather than lazy: the element
   * is genuinely there and genuinely interactive, and Playwright's visibility
   * heuristic is the thing that is wrong about it.
   */
  const otp = page.locator('input[autocomplete="one-time-code"]').first();
  /*
   * ⚠️ WAIT FOR IT TO ATTACH; DO NOT `count()` IMMEDIATELY. Clerk navigates to
   * the verification step asynchronously after the password is accepted, so a
   * `count()` run the instant the password is submitted returns 0, the branch
   * is skipped, and the run then waits sixty seconds for a URL change that will
   * never come. `waitFor` is the difference between reading the page and
   * guessing at its timing.
   */
  const needsCode = await otp
    .waitFor({ state: "attached", timeout: 20_000 })
    .then(() => true)
    .catch(() => false);

  if (needsCode) {
    // Clerk submits on the sixth digit; there is no button to press.
    await otp.fill("424242", { force: true });
  }

  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 60_000 });
  // The dashboard is the proof the tenant context resolved, not just that Clerk
  // issued a session — a signed-in user with no agency lands on onboarding.
  await page.goto("/app");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  await page.context().storageState({ path: STATE });
});
