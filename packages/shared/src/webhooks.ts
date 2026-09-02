import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * OUTBOUND WEBHOOK SIGNING & PAYLOAD TYPES — PLAN-V2 Part IV, dev-doc2 Module 24.
 *
 * Implements HMAC-SHA256 signature generation and constant-time verification
 * formatted as `t=<timestamp>,v1=<signature>` in header `X-PDM-Signature`.
 */

export type WebhookEventType =
  | "website.scan.completed"
  | "privacy_drift.detected"
  | "issue.created"
  | "issue.verified";

export const WEBHOOK_EVENT_TYPES: readonly WebhookEventType[] = [
  "website.scan.completed",
  "privacy_drift.detected",
  "issue.created",
  "issue.verified",
];

export interface WebhookPayload<T = Record<string, unknown>> {
  readonly id: string;
  readonly event: WebhookEventType;
  readonly createdAt: string;
  readonly agencyId: string;
  readonly data: T;
}

export interface WebhookSignatureParts {
  readonly timestamp: number;
  readonly signature: string;
}

export const WEBHOOK_SIGNATURE_HEADER = "x-pdm-signature";
export const DEFAULT_TOLERANCE_SECONDS = 300; // 5 minutes

/**
 * Computes an HMAC-SHA256 signature for a webhook payload string.
 * Formats header as `t=<timestamp>,v1=<signature>`.
 */
export function computeWebhookSignature(
  payloadString: string,
  secret: string,
  timestamp: number = Math.floor(Date.now() / 1000),
): string {
  const signedPayload = `${timestamp}.${payloadString}`;
  const hmac = createHmac("sha256", secret).update(signedPayload).digest("hex");
  return `t=${timestamp},v1=${hmac}`;
}

/**
 * Parses the `t=<timestamp>,v1=<signature>` header format.
 */
export function parseWebhookSignatureHeader(
  headerValue: string,
): WebhookSignatureParts | null {
  if (!headerValue || typeof headerValue !== "string") return null;

  const parts = headerValue.split(",");
  let timestamp: number | null = null;
  let signature: string | null = null;

  for (const part of parts) {
    const [key, value] = part.split("=");
    if (!value) continue;
    if (key === "t") {
      const parsed = parseInt(value, 10);
      if (!Number.isNaN(parsed)) timestamp = parsed;
    } else if (key === "v1") {
      signature = value;
    }
  }

  if (timestamp === null || !signature) return null;
  return { timestamp, signature };
}

/**
 * Verifies a webhook signature using constant-time comparison.
 * Asserts timestamp is within tolerance window to prevent replay attacks.
 */
export function verifyWebhookSignature(
  payloadString: string,
  signatureHeader: string,
  secret: string,
  toleranceSeconds: number = DEFAULT_TOLERANCE_SECONDS,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): { valid: boolean; reason?: "INVALID_FORMAT" | "TIMESTAMP_OUT_OF_RANGE" | "SIGNATURE_MISMATCH" } {
  const parsed = parseWebhookSignatureHeader(signatureHeader);
  if (!parsed) {
    return { valid: false, reason: "INVALID_FORMAT" };
  }

  if (Math.abs(nowSeconds - parsed.timestamp) > toleranceSeconds) {
    return { valid: false, reason: "TIMESTAMP_OUT_OF_RANGE" };
  }

  const expectedSignedPayload = `${parsed.timestamp}.${payloadString}`;
  const expectedSignature = createHmac("sha256", secret)
    .update(expectedSignedPayload)
    .digest("hex");

  const expectedBuffer = Buffer.from(expectedSignature, "utf8");
  const providedBuffer = Buffer.from(parsed.signature, "utf8");

  if (expectedBuffer.length !== providedBuffer.length) {
    return { valid: false, reason: "SIGNATURE_MISMATCH" };
  }

  const matches = timingSafeEqual(expectedBuffer, providedBuffer);
  if (!matches) {
    return { valid: false, reason: "SIGNATURE_MISMATCH" };
  }

  return { valid: true };
}
