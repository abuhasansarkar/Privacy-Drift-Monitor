import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@pdm/database";
import {
  makeAgency,
  makeWebsite,
  resetDatabase,
} from "@pdm/database/testing";
import { generateApiKey } from "@/server/services/api-keys";
import { GET as listReports } from "../reports/route";

describe("GET /api/v1/reports", () => {
  let agencyId: string;
  let ownerId: string;
  let readOnlyKey: string;

  beforeEach(async () => {
    await resetDatabase();
    const agency = await makeAgency({ name: "Reports API Agency" });
    agencyId = agency.id;
    ownerId = agency.ownerId;

    const key = await generateApiKey(agencyId, {
      name: "Read Only",
      scopes: ["read"],
    });
    readOnlyKey = key.secretToken;
  });

  async function seedReport(websiteId: string) {
    return prisma.report.create({
      data: {
        agencyId,
        websiteId,
        createdById: ownerId,
        name: "Privacy Drift Report",
        type: "PRIVACY_DRIFT",
        status: "READY",
        pageCount: 3,
        sizeBytes: 2048,
        generatedAt: new Date(),
      },
    });
  }

  it("returns 401 when API key is missing", async () => {
    const req = new Request("https://api.example.com/api/v1/reports");
    const res = await listReports(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns 403 when key lacks read scope", async () => {
    const writeKey = await generateApiKey(agencyId, {
      name: "Write Only",
      scopes: ["write"],
    });
    const req = new Request("https://api.example.com/api/v1/reports", {
      headers: { Authorization: `Bearer ${writeKey.secretToken}` },
    });
    const res = await listReports(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  it("returns 422 for an invalid type filter", async () => {
    const req = new Request("https://api.example.com/api/v1/reports?type=INVALID", {
      headers: { Authorization: `Bearer ${readOnlyKey}` },
    });
    const res = await listReports(req);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 422 for an invalid status filter", async () => {
    const req = new Request("https://api.example.com/api/v1/reports?status=INVALID", {
      headers: { Authorization: `Bearer ${readOnlyKey}` },
    });
    const res = await listReports(req);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("lists reports with pagination metadata", async () => {
    const website = await makeWebsite(agencyId);
    const report = await seedReport(website.id);

    const req = new Request("https://api.example.com/api/v1/reports", {
      headers: { Authorization: `Bearer ${readOnlyKey}` },
    });
    const res = await listReports(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.pagination.total).toBe(1);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe(report.id);
    expect(body.data[0].type).toBe("PRIVACY_DRIFT");
    expect(body.data[0].status).toBe("READY");
    expect(body.data[0].name).toBe("Privacy Drift Report");
    // READY reports include a downloadUrl
    expect(body.data[0].downloadUrl).toBe(`/api/v1/reports/${report.id}/download`);
  });

  it("never returns another agency's reports", async () => {
    const website = await makeWebsite(agencyId);
    await seedReport(website.id);

    const otherAgency = await makeAgency({ name: "Other Agency" });
    const otherWebsite = await makeWebsite(otherAgency.id);
    await prisma.report.create({
      data: {
        agencyId: otherAgency.id,
        websiteId: otherWebsite.id,
        createdById: otherAgency.ownerId,
        name: "Other Agency Report",
        type: "MONTHLY_MONITORING",
        status: "READY",
        pageCount: 5,
        sizeBytes: 4096,
        generatedAt: new Date(),
      },
    });

    const req = new Request("https://api.example.com/api/v1/reports", {
      headers: { Authorization: `Bearer ${readOnlyKey}` },
    });
    const res = await listReports(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    // Only this agency's report
    expect(body.pagination.total).toBe(1);
    expect(body.data[0].agencyId).toBe(agencyId);
  });

  it("filters by websiteId", async () => {
    const website1 = await makeWebsite(agencyId);
    const website2 = await makeWebsite(agencyId);
    const report1 = await seedReport(website1.id);
    await seedReport(website2.id);

    const req = new Request(
      `https://api.example.com/api/v1/reports?websiteId=${website1.id}`,
      { headers: { Authorization: `Bearer ${readOnlyKey}` } },
    );
    const res = await listReports(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.pagination.total).toBe(1);
    expect(body.data[0].id).toBe(report1.id);
  });
});
