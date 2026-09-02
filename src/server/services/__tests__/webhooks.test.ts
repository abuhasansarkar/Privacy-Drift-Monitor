import { describe, expect, it, vi } from "vitest";
import { dispatchWebhook } from "../webhooks";
import type { WebhookPayload } from "@pdm/shared";

describe("dispatchWebhook", () => {
  const secret = "whsec_test_secret_12345";
  const payload: WebhookPayload = {
    id: "evt_scan_1001",
    event: "website.scan.completed",
    createdAt: new Date().toISOString(),
    agencyId: "agency_xyz",
    data: { websiteId: "site_1", score: 95 },
  };

  it("blocks delivery to private or loopback addresses via SSRF guard", async () => {
    const result = await dispatchWebhook({
      endpointUrl: "http://127.0.0.1:9000/webhook",
      secret,
      payload,
    });

    expect(result.success).toBe(false);
    expect(result.statusCode).toBeNull();
    expect(result.error).toContain("SSRF_BLOCKED");
  });

  it("blocks delivery to cloud metadata endpoint", async () => {
    const result = await dispatchWebhook({
      endpointUrl: "http://169.254.169.254/latest/meta-data",
      secret,
      payload,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("SSRF_BLOCKED");
  });

  it("dispatches successfully to a public endpoint with signature header", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      status: 200,
    });

    const result = await dispatchWebhook({
      endpointUrl: "https://example.com/api/webhooks",
      secret,
      payload,
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    expect(result.success).toBe(true);
    expect(result.statusCode).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const callArgs = mockFetch.mock.calls[0];
    expect(callArgs[0]).toBe("https://example.com/api/webhooks");
    expect(callArgs[1].method).toBe("POST");
    expect(callArgs[1].headers["x-pdm-signature"]).toMatch(/^t=\d+,v1=[a-f0-9]{64}$/);
    expect(callArgs[1].headers["Content-Type"]).toBe("application/json");
  });

  it("returns error status when endpoint returns HTTP 500", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      status: 500,
    });

    const result = await dispatchWebhook({
      endpointUrl: "https://example.com/api/webhooks",
      secret,
      payload,
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    expect(result.success).toBe(false);
    expect(result.statusCode).toBe(500);
    expect(result.error).toBe("HTTP_500");
  });
});
