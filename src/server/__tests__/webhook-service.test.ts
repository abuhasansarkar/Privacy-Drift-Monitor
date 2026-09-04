import { beforeEach, describe, expect, it } from "vitest";
import { makeAgency, resetDatabase } from "@pdm/database/testing";
import {
  createWebhookEndpoint,
  listWebhookEndpoints,
  deleteWebhookEndpoint,
} from "../services/webhook-service";

describe("Webhook Management Service", () => {
  let agencyId: string;

  beforeEach(async () => {
    await resetDatabase();
    const agency = await makeAgency({ name: "Webhook Test Agency" });
    agencyId = agency.id;
  });

  it("blocks SSRF attempts on webhook endpoint creation", async () => {
    await expect(
      createWebhookEndpoint(agencyId, {
        url: "http://127.0.0.1:8080/webhook",
        description: "Localhost probe",
      }),
    ).rejects.toThrow();
  });

  it("creates, lists, and deletes valid webhook endpoints", async () => {
    const endpoint = await createWebhookEndpoint(agencyId, {
      url: "https://example.com/api/webhooks/pdm",
      description: "Production Webhook",
      events: ["website.scan.completed", "privacy_drift.detected"],
    });

    expect(endpoint.url).toBe("https://example.com/api/webhooks/pdm");
    expect(endpoint.secret).toMatch(/^whsec_[0-9a-f]{48}$/);
    expect(endpoint.events).toEqual(["website.scan.completed", "privacy_drift.detected"]);

    const list = await listWebhookEndpoints(agencyId);
    expect(list.length).toBe(1);
    expect(list[0].id).toBe(endpoint.id);
    expect(list[0].url).toBe(endpoint.url);

    // Delete endpoint
    const delResult = await deleteWebhookEndpoint(agencyId, endpoint.id);
    expect(delResult.success).toBe(true);

    const emptyList = await listWebhookEndpoints(agencyId);
    expect(emptyList.length).toBe(0);
  });
});
