/**
 * CLOUDFLARE TURNSTILE — PLAN.md Part III §3.2, Part X §10.4, Phase 6 task 6.5.
 *
 * §3.2: "Turnstile required before enqueue; token verified server-side,
 * single-use."
 *
 * ⚠️ THE CLIENT-SIDE WIDGET PROVES NOTHING. A token is a string in a POST body;
 * anyone can send one. The only thing that makes Turnstile a control is this
 * server-side call to Cloudflare, and Cloudflare enforcing that a token is
 * redeemed once. Rendering the widget without verifying is a decoration.
 *
 * ⚠️ IT FAILS CLOSED WHEN CONFIGURED AND OPEN WHEN NOT, which sounds backwards
 * until you name the two situations. With a secret configured, a verification
 * that errors is a REJECTION — an attacker who can make our call to Cloudflare
 * fail must not thereby switch the challenge off. With NO secret configured we
 * are in local development or a CI run, where the alternative is that the free
 * scanner cannot be exercised at all; the decision is explicit, returns
 * `configured: false`, and the caller logs it.
 */

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export interface TurnstileResult {
  success: boolean;
  /** False when no secret is set — development and CI. */
  configured: boolean;
  /** Cloudflare's machine-readable reasons. Log-only; never shown to a user. */
  errorCodes: string[];
}

export interface VerifyTurnstileOptions {
  token: string;
  /** The submitter's IP, if known. Cloudflare uses it as a signal. */
  remoteIp?: string | null;
  secret?: string | undefined;
  /** Injected in tests. */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export async function verifyTurnstile(
  options: VerifyTurnstileOptions,
): Promise<TurnstileResult> {
  const secret = options.secret ?? process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    return { success: true, configured: false, errorCodes: [] };
  }

  if (!options.token) {
    return { success: false, configured: true, errorCodes: ["missing-input-response"] };
  }

  const doFetch = options.fetchImpl ?? fetch;
  const body = new URLSearchParams({ secret, response: options.token });
  if (options.remoteIp) body.set("remoteip", options.remoteIp);

  /*
   * ⚠️ A TIMEOUT, BECAUSE THIS SITS IN FRONT OF A USER PRESSING A BUTTON.
   * Without one, a Cloudflare incident turns every free-scan submission into a
   * hung request holding a Node handle open — which is a denial of service we
   * inflict on ourselves through the abuse control.
   */
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 5_000);

  try {
    const response = await doFetch(VERIFY_URL, {
      method: "POST",
      body,
      signal: controller.signal,
    });
    if (!response.ok) {
      return { success: false, configured: true, errorCodes: [`http-${response.status}`] };
    }

    const data = (await response.json()) as {
      success?: unknown;
      "error-codes"?: unknown;
    };
    return {
      success: data.success === true,
      configured: true,
      errorCodes: Array.isArray(data["error-codes"])
        ? data["error-codes"].map(String)
        : [],
    };
  } catch (error) {
    // Fails CLOSED — see the note at the top of this file.
    return {
      success: false,
      configured: true,
      errorCodes: ["verification-failed", error instanceof Error ? error.name : "unknown"],
    };
  } finally {
    clearTimeout(timer);
  }
}
