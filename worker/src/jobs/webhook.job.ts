import { unsafeGlobalClient } from "@pdm/database";
import { assertSafeUrl } from "@pdm/scanner";
import type { WebhookJobData } from "@pdm/scanner/queue/queues";
import {
  computeWebhookSignature,
  WEBHOOK_SIGNATURE_HEADER,
} from "@pdm/shared";
import { childLogger } from "@pdm/shared/logger";
import type { Job } from "bullmq";

/**
 * OUTBOUND WEBHOOK WORKER — PLAN-V3 Part II System 6, Phase 16.
 *
 * Consumes webhook dispatch jobs from the `pdm-webhook` queue.
 * Dispatches HMAC-SHA256 signed JSON payloads with SSRF pre-flight validation,
 * updates WebhookDelivery rows, and handles exponential retry backoff.
 */

const db = unsafeGlobalClient(
  "Webhook worker runs across multiple agencies and manages delivery tracking",
);

const log = childLogger({ component: "webhook-job" });

export interface WebhookJobDeps {
  fetchFn?: typeof fetch;
  timeoutMs?: number;
  db?: {
    webhookDelivery: {
      update: (args: unknown) => Promise<unknown>;
    };
  };
}

export async function processWebhookJob(
  job: Job<WebhookJobData>,
  deps?: WebhookJobDeps,
): Promise<{ success: boolean; statusCode: number | null }> {
  const database = (deps?.db as typeof db) ?? db;
  const { deliveryId, endpointUrl, secret, payload } = job.data;
  const currentAttempt = job.attemptsMade + 1;
  const maxAttempts = job.opts.attempts ?? 5;
  const timeoutMs = deps?.timeoutMs ?? 10_000;
  const fetchFn = deps?.fetchFn ?? fetch;

  const startedAt = Date.now();
  let statusCode: number | null = null;
  let durationMs = 0;
  let errorText: string | undefined;

  try {
    // 1. SSRF Safety Check: prevent targeting internal/loopback endpoints
    await assertSafeUrl(endpointUrl);

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

      durationMs = Date.now() - startedAt;
      statusCode = response.status;

      if (response.status >= 200 && response.status < 300) {
        // Success
        try {
          await database.webhookDelivery.update({
            where: { id: deliveryId },
            data: {
              status: "SUCCESS",
              statusCode,
              durationMs,
              attempt: currentAttempt,
              error: null,
            },
          });
        } catch (dbErr) {
          log.warn({ dbErr, deliveryId }, "could not update webhook delivery success status");
        }

        log.info(
          { deliveryId, endpointUrl, statusCode, durationMs, attempt: currentAttempt },
          "webhook delivered successfully",
        );
        return { success: true, statusCode };
      }

      errorText = `HTTP_${response.status}`;
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (err) {
    durationMs = Date.now() - startedAt;
    const isSsrf =
      err instanceof Error &&
      (err.name === "SsrfBlockedError" ||
        err.message.includes("SSRF") ||
        err.message.includes("BAD_PORT") ||
        err.message.includes("PRIVATE_IP") ||
        err.message.includes("LOOPBACK"));
    const isTimeout =
      err instanceof Error &&
      (err.name === "AbortError" || err.message.includes("aborted"));
    errorText = isSsrf
      ? `SSRF_BLOCKED: ${err.message}`
      : isTimeout
        ? "TIMEOUT"
        : err instanceof Error
          ? err.message
          : "NETWORK_ERROR";

    if (isSsrf) {
      try {
        await database.webhookDelivery.update({
          where: { id: deliveryId },
          data: {
            status: "FAILED",
            statusCode: null,
            durationMs,
            attempt: currentAttempt,
            error: errorText,
          },
        });
      } catch (dbErr) {
        log.warn({ dbErr, deliveryId }, "could not update webhook delivery failure status");
      }
      return { success: false, statusCode: null };
    }
  }

  // Handle Failure
  log.warn(
    { deliveryId, endpointUrl, error: errorText, attempt: currentAttempt, maxAttempts },
    "webhook delivery attempt failed",
  );

  if (currentAttempt >= maxAttempts) {
    // Dead-letter: Final attempt failed
    try {
      await database.webhookDelivery.update({
        where: { id: deliveryId },
        data: {
          status: "FAILED",
          statusCode,
          durationMs,
          attempt: currentAttempt,
          error: errorText,
        },
      });
    } catch (dbErr) {
      log.warn({ dbErr, deliveryId }, "could not update webhook delivery failure status");
    }

    log.error(
      { deliveryId, endpointUrl, error: errorText, attempts: currentAttempt },
      "webhook delivery permanently failed (max retries exhausted)",
    );
    return { success: false, statusCode };
  }

  // Intermediate attempt failed: update record and re-throw to trigger BullMQ exponential backoff
  try {
    await database.webhookDelivery.update({
      where: { id: deliveryId },
      data: {
        status: "PENDING",
        statusCode,
        durationMs,
        attempt: currentAttempt,
        error: errorText,
      },
    });
  } catch (dbErr) {
    log.warn({ dbErr, deliveryId }, "could not update webhook delivery pending status");
  }

  throw new Error(`Webhook delivery attempt ${currentAttempt}/${maxAttempts} failed: ${errorText}`);
}
