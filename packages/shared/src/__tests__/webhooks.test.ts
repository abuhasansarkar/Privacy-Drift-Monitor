import { describe, expect, it } from "vitest";
import {
  computeWebhookSignature,
  parseWebhookSignatureHeader,
  verifyWebhookSignature,
  WEBHOOK_EVENT_TYPES,
  type WebhookPayload,
} from "../webhooks";

describe("Webhook Signature & Verification", () => {
  const secret = "whsec_test_secret_key_12345";
  const payload: WebhookPayload<{ score: number }> = {
    id: "evt_123456",
    event: "website.scan.completed",
    createdAt: new Date().toISOString(),
    agencyId: "agency_abc",
    data: { score: 92 },
  };
  const payloadString = JSON.stringify(payload);

  it("computes a valid signature string matching t=<timestamp>,v1=<hash>", () => {
    const timestamp = 1700000000;
    const header = computeWebhookSignature(payloadString, secret, timestamp);

    expect(header).toMatch(/^t=1700000000,v1=[a-f0-9]{64}$/);
  });

  it("parses the signature header cleanly", () => {
    const header = "t=1700000000,v1=abcdef1234567890";
    const parsed = parseWebhookSignatureHeader(header);

    expect(parsed).toEqual({
      timestamp: 1700000000,
      signature: "abcdef1234567890",
    });
  });

  it("returns null for malformed signature headers", () => {
    expect(parseWebhookSignatureHeader("invalid_header")).toBeNull();
    expect(parseWebhookSignatureHeader("t=not_a_number,v1=abc")).toBeNull();
    expect(parseWebhookSignatureHeader("")).toBeNull();
  });

  it("verifies a valid signature when timestamp is within tolerance", () => {
    const timestamp = 1700000000;
    const header = computeWebhookSignature(payloadString, secret, timestamp);

    const result = verifyWebhookSignature(
      payloadString,
      header,
      secret,
      300,
      timestamp + 60, // 60s later, within 300s tolerance
    );

    expect(result.valid).toBe(true);
  });

  it("rejects when timestamp is outside the tolerance window (replay protection)", () => {
    const timestamp = 1700000000;
    const header = computeWebhookSignature(payloadString, secret, timestamp);

    const result = verifyWebhookSignature(
      payloadString,
      header,
      secret,
      300,
      timestamp + 301, // 301s later, expired
    );

    expect(result.valid).toBe(false);
    expect(result.reason).toBe("TIMESTAMP_OUT_OF_RANGE");
  });

  it("rejects when the payload has been tampered with", () => {
    const timestamp = 1700000000;
    const header = computeWebhookSignature(payloadString, secret, timestamp);

    const tamperedPayload = JSON.stringify({ ...payload, agencyId: "agency_hacked" });

    const result = verifyWebhookSignature(
      tamperedPayload,
      header,
      secret,
      300,
      timestamp,
    );

    expect(result.valid).toBe(false);
    expect(result.reason).toBe("SIGNATURE_MISMATCH");
  });

  it("rejects when an incorrect secret is used", () => {
    const timestamp = 1700000000;
    const header = computeWebhookSignature(payloadString, secret, timestamp);

    const result = verifyWebhookSignature(
      payloadString,
      header,
      "whsec_wrong_secret",
      300,
      timestamp,
    );

    expect(result.valid).toBe(false);
    expect(result.reason).toBe("SIGNATURE_MISMATCH");
  });

  it("exports all 4 core webhook event types", () => {
    expect(WEBHOOK_EVENT_TYPES).toEqual([
      "website.scan.completed",
      "privacy_drift.detected",
      "issue.created",
      "issue.verified",
    ]);
  });
});
