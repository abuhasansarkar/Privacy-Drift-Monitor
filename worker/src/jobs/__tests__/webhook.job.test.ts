import { describe, expect, it, vi } from "vitest";
import { computeWebhookSignature, verifyWebhookSignature } from "@pdm/shared";
import { processWebhookJob } from "../webhook.job";
import type { Job } from "bullmq";
import type { WebhookJobData } from "@pdm/scanner/queue/queues";

describe("Outbound Webhook Worker Job", () => {
  const secret = "whsec_0123456789abcdef0123456789abcdef0123456789abcdef";
  const payload = {
    id: "whd_test123",
    event: "website.scan.completed",
    agencyId: "agency_test",
    createdAt: new Date().toISOString(),
    data: { scanId: "scan_123", status: "COMPLETED" },
  };

  it("computes and verifies HMAC-SHA256 signatures with timestamp", () => {
    const rawBody = JSON.stringify(payload);
    const signature = computeWebhookSignature(rawBody, secret);

    expect(signature).toMatch(/^t=\d+,v1=[0-9a-f]{64}$/);
    expect(verifyWebhookSignature(rawBody, signature, secret).valid).toBe(true);
    expect(verifyWebhookSignature(rawBody + "tampered", signature, secret).valid).toBe(false);
    expect(verifyWebhookSignature(rawBody, signature, "whsec_wrongsecret").valid).toBe(false);
  });

  it("fails fast on SSRF loopback endpoints", async () => {
    const mockJob = {
      id: "job-1",
      attemptsMade: 0,
      opts: { attempts: 5 },
      data: {
        deliveryId: "whd_test_ssrf",
        endpointId: "ep_1",
        endpointUrl: "http://127.0.0.1:9000/webhook",
        secret,
        event: "website.scan.completed",
        payload,
        attempt: 1,
      },
    } as unknown as Job<WebhookJobData>;

    const mockDb = {
      webhookDelivery: {
        update: vi.fn().mockResolvedValue({}),
      },
    };

    const result = await processWebhookJob(mockJob, {
      db: mockDb,
    });
    expect(result.success).toBe(false);
    expect(result.statusCode).toBeNull();
    expect(mockDb.webhookDelivery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "whd_test_ssrf" },
        data: expect.objectContaining({ status: "FAILED" }),
      }),
    );
  });

  it("successfully dispatches signed payload via fetch", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => "ok",
    } as unknown as Response);

    const mockDb = {
      webhookDelivery: {
        update: vi.fn().mockResolvedValue({}),
      },
    };

    const mockJob = {
      id: "job-2",
      attemptsMade: 0,
      opts: { attempts: 5 },
      data: {
        deliveryId: "whd_test_success",
        endpointId: "ep_2",
        endpointUrl: "https://example.com/webhooks/incoming",
        secret,
        event: "website.scan.completed",
        payload,
        attempt: 1,
      },
    } as unknown as Job<WebhookJobData>;

    const result = await processWebhookJob(mockJob, {
      fetchFn: mockFetch as unknown as typeof fetch,
      db: mockDb,
    });

    expect(result.success).toBe(true);
    expect(result.statusCode).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const callArgs = mockFetch.mock.calls[0]!;
    expect(callArgs[0]).toBe("https://example.com/webhooks/incoming");
    const init = callArgs[1] as RequestInit;
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["x-pdm-signature"]).toMatch(/^t=\d+,v1=/);
  });
});
