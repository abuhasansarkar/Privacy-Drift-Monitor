import "server-only";
import { assertSafeUrl } from "@pdm/scanner";
import {
  computeWebhookSignature,
  WEBHOOK_SIGNATURE_HEADER,
  type WebhookPayload,
} from "@pdm/shared";
import { childLogger } from "@pdm/shared/logger";

/**
 * OUTBOUND WEBHOOK DISPATCHER — PLAN-V2 Part IV, dev-doc2 Module 24.
 *
 * Dispatches HMAC-SHA256 signed event payloads to customer endpoints.
 * Enforces SSRF pre-flight validation and timeout bounding.
 *
 * ⚠️ **NOT WIRED INTO THE PRODUCT. THIS IS INFRASTRUCTURE, NOT A FEATURE.**
 * Nothing calls `dispatchWebhook` except its own test. There is no Prisma model
 * for a customer endpoint, no UI to register one, no secret to sign with and no
 * enqueue path from any event. Module 24 also specifies a public API v1, which
 * does not exist either.
 *
 * It is documented here rather than deleted because the transport is correct
 * and tested, and because a reader finding a complete-looking dispatcher has no
 * other way to discover it is unreachable. Do not describe webhooks as a
 * shipped capability — in the marketing copy, in `dev-doc2/modules/24-*.md`, or
 * to a customer — until an endpoint model, a signing secret and a producer
 * exist. See `OVERVIEW.md`.
 */

export interface WebhookDispatchResult {
  readonly success: boolean;
  readonly statusCode: number | null;
  readonly durationMs: number;
  readonly error?: string;
}

export interface DispatchWebhookOptions {
  readonly endpointUrl: string;
  readonly secret: string;
  readonly payload: WebhookPayload;
  readonly timeoutMs?: number;
  readonly fetchFn?: typeof fetch;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const log = childLogger({ component: "webhooks" });

/**
 * Dispatches a webhook payload to an external endpoint URL.
 * Checks URL safety with the SSRF guard before initiating HTTP POST.
 */
export async function dispatchWebhook(
  options: DispatchWebhookOptions,
): Promise<WebhookDispatchResult> {
  const {
    endpointUrl,
    secret,
    payload,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    fetchFn = fetch,
  } = options;

  const startedAt = Date.now();

  try {
    // 1. SSRF Guard Pre-validation: ensure customer is not targeting internal infrastructure
    await assertSafeUrl(endpointUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : "SSRF blocked";
    log.warn({ endpointUrl, err: error }, "webhook delivery blocked by SSRF guard");
    return {
      success: false,
      statusCode: null,
      durationMs: Date.now() - startedAt,
      error: `SSRF_BLOCKED: ${message}`,
    };
  }

  const payloadString = JSON.stringify(payload);
  const signature = computeWebhookSignature(payloadString, secret);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchFn(endpointUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "PrivacyDriftMonitor-Webhook/1.0",
        [WEBHOOK_SIGNATURE_HEADER]: signature,
      },
      body: payloadString,
      signal: controller.signal,
    });

    const durationMs = Date.now() - startedAt;
    const success = response.status >= 200 && response.status < 300;

    return {
      success,
      statusCode: response.status,
      durationMs,
      error: success ? undefined : `HTTP_${response.status}`,
    };
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const isTimeout =
      error instanceof Error &&
      (error.name === "AbortError" || error.message.includes("aborted"));

    const errorMessage = isTimeout ? "TIMEOUT" : error instanceof Error ? error.message : "NETWORK_ERROR";

    log.warn({ endpointUrl, error: errorMessage }, "webhook delivery failed");

    return {
      success: false,
      statusCode: null,
      durationMs,
      error: errorMessage,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
