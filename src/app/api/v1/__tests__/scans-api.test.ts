import { beforeEach, describe, expect, it } from "vitest";
import {
  makeAgency,
  makeScanWithEvidence,
  makeWebsite,
  resetDatabase,
} from "@pdm/database/testing";
import { generateApiKey } from "@/server/services/api-keys";
import { GET as getScan } from "../scans/[id]/route";

describe("GET /api/v1/scans/[id]", () => {
  let agencyId: string;
  let readOnlyKey: string;

  beforeEach(async () => {
    await resetDatabase();
    const agency = await makeAgency({ name: "Scans API Agency" });
    agencyId = agency.id;

    const key = await generateApiKey(agencyId, {
      name: "Read Only",
      scopes: ["read"],
    });
    readOnlyKey = key.secretToken;
  });

  it("returns 401 when API key is missing", async () => {
    const req = new Request("https://api.example.com/api/v1/scans/scan-123");
    const res = await getScan(req, { params: Promise.resolve({ id: "scan-123" }) });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns 403 when key lacks read scope", async () => {
    const writeKey = await generateApiKey(agencyId, {
      name: "Write Only",
      scopes: ["write"],
    });
    const req = new Request("https://api.example.com/api/v1/scans/scan-123", {
      headers: { Authorization: `Bearer ${writeKey.secretToken}` },
    });
    const res = await getScan(req, { params: Promise.resolve({ id: "scan-123" }) });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  it("returns 404 for a non-existent scan", async () => {
    const req = new Request("https://api.example.com/api/v1/scans/non-existent", {
      headers: { Authorization: `Bearer ${readOnlyKey}` },
    });
    const res = await getScan(req, { params: Promise.resolve({ id: "non-existent" }) });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("returns scan details with issues for an existing scan", async () => {
    const website = await makeWebsite(agencyId);
    const { scan, issue } = await makeScanWithEvidence(agencyId, website.id);

    const req = new Request(`https://api.example.com/api/v1/scans/${scan.id}`, {
      headers: { Authorization: `Bearer ${readOnlyKey}` },
    });
    const res = await getScan(req, { params: Promise.resolve({ id: scan.id }) });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data.id).toBe(scan.id);
    expect(body.data.websiteId).toBe(website.id);
    expect(body.data.website.id).toBe(website.id);
    expect(body.data.issuesCount).toBe(1);
    expect(body.data.issues[0].id).toBe(issue.id);
  });

  it("never returns another agency's scan", async () => {
    const otherAgency = await makeAgency({ name: "Other Agency" });
    const otherWebsite = await makeWebsite(otherAgency.id);
    const { scan: otherScan } = await makeScanWithEvidence(otherAgency.id, otherWebsite.id);

    const req = new Request(`https://api.example.com/api/v1/scans/${otherScan.id}`, {
      headers: { Authorization: `Bearer ${readOnlyKey}` },
    });
    const res = await getScan(req, { params: Promise.resolve({ id: otherScan.id }) });
    // Tenant isolation: the scan exists but belongs to another agency — must be 404
    expect(res.status).toBe(404);
  });
});
