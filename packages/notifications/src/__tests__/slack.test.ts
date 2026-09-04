import { describe, expect, it, vi } from "vitest";
import { buildSlackBlocks, sendSlackAlert } from "../slack";

describe("Slack Block Kit Alerts", () => {
  it("builds rich Block Kit message structure", () => {
    const blocks = buildSlackBlocks({
      webhookUrl: "https://hooks.slack.com/services/T00/B00/X00",
      websiteUrl: "https://example.com",
      websiteLabel: "Client Store",
      title: "Consent Regression Detected",
      severity: "CRITICAL",
      body: "Trackers fired before consent on the checkout page.",
      healthScore: 68,
      previousScore: 92,
      criticalCount: 2,
    });

    expect(blocks).toHaveProperty("blocks");
    const list = blocks.blocks as Array<{ type: string; text?: { text: string } }>;
    expect(list.length).toBeGreaterThan(2);

    // Header block with rotating light emoji for CRITICAL
    expect(list[0]!.type).toBe("header");
    expect(list[0]!.text?.text).toContain(":rotating_light:");
    expect(list[0]!.text?.text).toContain("Consent Regression Detected");

    // Fields block
    expect(list[1]!.type).toBe("section");
  });

  it("blocks SSRF attempts to localhost/internal IPs", async () => {
    const result = await sendSlackAlert({
      webhookUrl: "http://127.0.0.1:8080/internal-hook",
      websiteUrl: "https://example.com",
      title: "Test Alert",
      severity: "HIGH",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("SSRF");
  });

  it("sends payload to valid webhook URL using injected fetch", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => "ok",
    } as unknown as Response);

    const result = await sendSlackAlert({
      webhookUrl: "https://hooks.slack.com/services/T123/B456/789",
      websiteUrl: "https://example.com",
      title: "Test Alert",
      severity: "MEDIUM",
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    expect(result.success).toBe(true);
    expect(result.statusCode).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const callArgs = mockFetch.mock.calls[0]!;
    expect(callArgs[0]).toBe("https://hooks.slack.com/services/T123/B456/789");
    const init = callArgs[1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    const parsed = JSON.parse(init.body as string);
    expect(parsed).toHaveProperty("blocks");
  });

  it("returns error details when Slack rejects payload", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => "invalid_payload",
    } as unknown as Response);

    const result = await sendSlackAlert({
      webhookUrl: "https://hooks.slack.com/services/T123/B456/789",
      websiteUrl: "https://example.com",
      title: "Malformed",
      severity: "LOW",
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    expect(result.success).toBe(false);
    expect(result.statusCode).toBe(400);
    expect(result.error).toContain("Slack rejected with HTTP 400");
  });
});
