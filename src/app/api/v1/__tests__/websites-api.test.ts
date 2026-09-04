import { beforeEach, describe, expect, it } from "vitest";
import { makeAgency, resetDatabase } from "@pdm/database/testing";
import { generateApiKey } from "@/server/services/api-keys";
import { GET as getWebsites, POST as postWebsite } from "../websites/route";
import { POST as triggerScanRoute } from "../websites/[id]/scans/route";

describe("Public REST API v1 Endpoints", () => {
  let agencyId: string;
  let readOnlyKey: string;
  let fullAccessKey: string;

  beforeEach(async () => {
    await resetDatabase();
    const agency = await makeAgency({ name: "REST API Agency" });
    agencyId = agency.id;

    const readKeyObj = await generateApiKey(agencyId, {
      name: "Read Only",
      scopes: ["read"],
    });
    readOnlyKey = readKeyObj.secretToken;

    const fullKeyObj = await generateApiKey(agencyId, {
      name: "Full Access",
      scopes: ["read", "write"],
    });
    fullAccessKey = fullKeyObj.secretToken;
  });

  it("GET /api/v1/websites returns 401 when API key is missing", async () => {
    const req = new Request("https://api.example.com/api/v1/websites");
    const res = await getWebsites(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("POST /api/v1/websites returns 403 when key lacks write scope", async () => {
    const req = new Request("https://api.example.com/api/v1/websites", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${readOnlyKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url: "https://example.com" }),
    });

    const res = await postWebsite(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  it("POST /api/v1/websites blocks SSRF internal URL", async () => {
    const req = new Request("https://api.example.com/api/v1/websites", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${fullAccessKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url: "http://127.0.0.1:8080/internal" }),
    });

    const res = await postWebsite(req);
    expect(res.status).toBe(422);
  });

  it("POST /api/v1/websites creates website and GET /api/v1/websites lists it", async () => {
    const createReq = new Request("https://api.example.com/api/v1/websites", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${fullAccessKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: "https://example.com",
        label: "Example Agency Client",
        scanFrequency: "WEEKLY",
      }),
    });

    const createRes = await postWebsite(createReq);
    expect(createRes.status).toBe(201);
    const createdData = await createRes.json();
    expect(createdData.data.url).toBe("https://example.com");
    expect(createdData.data.label).toBe("Example Agency Client");

    // Now list via GET
    const listReq = new Request("https://api.example.com/api/v1/websites", {
      headers: {
        Authorization: `Bearer ${readOnlyKey}`,
      },
    });

    const listRes = await getWebsites(listReq);
    expect(listRes.status).toBe(200);
    const listData = await listRes.json();
    expect(listData.data.length).toBe(1);
    expect(listData.data[0].id).toBe(createdData.data.id);
    expect(listData.pagination.total).toBe(1);
  });

  it("POST /api/v1/websites/[id]/scans enqueues scan on existing site", async () => {
    // Create website first
    const createReq = new Request("https://api.example.com/api/v1/websites", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${fullAccessKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: "https://example.com",
        scanFrequency: "WEEKLY",
      }),
    });
    const createRes = await postWebsite(createReq);
    expect(createRes.status).toBe(201);
    const { data: website } = await createRes.json();

    // Trigger scan
    const scanReq = new Request(`https://api.example.com/api/v1/websites/${website.id}/scans`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${fullAccessKey}`,
      },
    });

    const scanRes = await triggerScanRoute(scanReq, {
      params: Promise.resolve({ id: website.id }),
    });

    expect(scanRes.status).toBe(202);
    const scanData = await scanRes.json();
    expect(scanData.data.status).toBe("QUEUED");
    expect(scanData.data.scanId).toBeDefined();
  });
});
