import type { Page } from "playwright";
import { assertSafeUrl } from "../net/guard";
import { decryptCredentials, type CredentialSecrets } from "./crypto";

/**
 * BEHIND-LOGIN AUTHENTICATED SCAN RUNNER — Phase 17 task 17.3.
 *
 * Automates form-based authentication into member portals and internal areas
 * using Playwright. Decrypts credentials stored with AES-256-GCM, fills form selectors,
 * submits, and verifies session cookies and navigation away from the login form.
 *
 * ⚠️ CREDENTIAL INTEGRITY & PRIVACY:
 * Plaintext passwords and secret tokens are NEVER logged, serialized, or emitted in
 * error messages.
 */

export interface AuthenticatedScanConfigPayload {
  loginUrl: string;
  usernameSelector: string;
  passwordSelector: string;
  submitSelector: string;
  encryptedSecrets: string;
  isActive: boolean;
}

export interface LoginResult {
  success: boolean;
  initialUrl: string;
  finalUrl: string;
  cookies: Array<{ name: string; domain: string; path: string }>;
  error?: string;
}

export interface LoginRunnerOptions {
  timeoutMs?: number;
  customKey?: Buffer;
  urlGuard?: typeof assertSafeUrl;
}

/**
 * Executes the login sequence on the provided Playwright page.
 */
export async function performAuthenticatedLogin(
  page: Page,
  config: AuthenticatedScanConfigPayload,
  options: LoginRunnerOptions = {},
): Promise<LoginResult> {
  const timeoutMs = options.timeoutMs ?? 15_000;
  const guard = options.urlGuard ?? assertSafeUrl;

  // 1. SSRF Pre-flight check
  try {
    await guard(config.loginUrl);
  } catch (ssrfErr) {
    return {
      success: false,
      initialUrl: config.loginUrl,
      finalUrl: config.loginUrl,
      cookies: [],
      error: `SSRF blocked on login URL: ${ssrfErr instanceof Error ? ssrfErr.message : String(ssrfErr)}`,
    };
  }

  // 2. Decrypt credentials
  let credentials: CredentialSecrets;
  try {
    credentials = decryptCredentials(config.encryptedSecrets, options.customKey);
  } catch (decErr) {
    return {
      success: false,
      initialUrl: config.loginUrl,
      finalUrl: config.loginUrl,
      cookies: [],
      error: `Failed to decrypt credentials: ${decErr instanceof Error ? decErr.message : "Decryption failed"}`,
    };
  }

  try {
    // 3. Navigate to login URL
    await page.goto(config.loginUrl, {
      waitUntil: "domcontentloaded",
      timeout: timeoutMs,
    });

    // 4. Wait for username and password fields
    await page.waitForSelector(config.usernameSelector, { timeout: timeoutMs });
    await page.waitForSelector(config.passwordSelector, { timeout: timeoutMs });

    // 5. Fill fields
    await page.fill(config.usernameSelector, credentials.username);
    await page.fill(config.passwordSelector, credentials.password);

    // 6. Submit form and wait for navigation / network idle
    const navigationPromise = page
      .waitForNavigation({ timeout: timeoutMs, waitUntil: "load" })
      .catch(() => null);

    await page.click(config.submitSelector);
    await navigationPromise;

    // Small delay to allow session cookies to settle
    await page.waitForTimeout(1000);

    const finalUrl = page.url();
    const context = page.context();
    const cookies = await context.cookies();

    // Verification: did URL change or were session cookies set?
    const urlChanged = finalUrl.toLowerCase() !== config.loginUrl.toLowerCase();
    const hasCookies = cookies.length > 0;
    const isSuccess = urlChanged || hasCookies;

    return {
      success: isSuccess,
      initialUrl: config.loginUrl,
      finalUrl,
      cookies: cookies.map((c) => ({
        name: c.name,
        domain: c.domain,
        path: c.path,
      })),
      error: isSuccess ? undefined : "Login form submitted but session was not established",
    };
  } catch (err) {
    return {
      success: false,
      initialUrl: config.loginUrl,
      finalUrl: page.url(),
      cookies: [],
      error: err instanceof Error ? err.message : "Login sequence failed",
    };
  }
}
