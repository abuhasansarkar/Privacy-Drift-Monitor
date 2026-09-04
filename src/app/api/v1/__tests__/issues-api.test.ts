import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@pdm/database";
import {
  makeAgency,
  makeScanWithEvidence,
  makeWebsite,
  resetDatabase,
} from "@pdm/database/testing";
import { generateApiKey } from "@/server/services/api-keys";
import { GET as listIssues } from "../issues/route";

describe("GET /api/v1/issues", () => {
  let agencyId: string;
  let readOnlyKey: string;

  beforeEach(async () => {
    await resetDatabase();
    const agency = await makeAgency({ name: "Issues API Agency" });
    agencyId = agency.id;

    const key = await generateApiKey(agencyId, {
      name: "Read Only",
      scopes: ["read"],
    });
    readOnlyKey = key.secretToken;
  });

  async function seedIssue() {
    const website = await makeWebsite(agencyId);
    const { issue } = await makeScanWithEvidence(agencyId, website.id);
    return { website, issue };
  }

  it("returns 401 when the API key is missing", async () => {
    const req = new Request("https://api.example.com/api/v1/issues");
    const res = await listIssues(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns 403 when the key lacks the read scope", async () => {
    // generateApiKey validates scopes, so build a write-only key through the
    // same service and confirm the gate rejects it.
    const writeKey = await generateApiKey(agencyId, {
      name: "Write Only",
      scopes: ["write"],
    });
    const req = new Request("https://api.example.com/api/v1/issues", {
      headers: { Authorization: `Bearer ${writeKey.secretToken}` },
    });
    const res = await listIssues(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  it("returns 422 for an unknown severity filter value", async () => {
    const req = new Request("https://api.example.com/api/v1/issues?severity=EXTREME", {
      headers: { Authorization: `Bearer ${readOnlyKey}` },
    });
    const res = await listIssues(req);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("lists findings for the agency with pagination metadata", async () => {
    const { website, issue } = await seedIssue();

    const req = new Request("https://api.example.com/api/v1/issues", {
      headers: { Authorization: `Bearer ${readOnlyKey}` },
    });
    const res = await listIssues(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.pagination.total).toBe(1);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe(issue.id);
    expect(body.data[0].ruleId).toBe("PDM-R001");
    expect(body.data[0].severity).toBe("CRITICAL");
    expect(body.data[0].website.id).toBe(website.id);
    expect(body.data[0].website.url).toBe(website.url);
  });

  it("filters by severity", async () => {
    const { issue } = await seedIssue();
    const website = await makeWebsite(agencyId);
    const scan = await makeScanWithEvidence(agencyId, website.id);

    // A second, lower-severity finding on the same shape of evidence.
    await prisma.issue.create({
      data: {
        agencyId,
        websiteId: website.id,
        firstScanId: scan.scan.id,
        lastScanId: scan.scan.id,
        ruleId: "PDM-R049",
        ruleVersion: 1,
        fingerprint: `PDM-R049:${website.id}:stale-policy`,
        category: "POLICY",
        severity: "INFO",
        status: "NEW",
        confidence: 0.9,
        title: "Privacy policy effective date older than 365 days",
        message: "The detected effective date is over a year old.",
        technicalReason: "Extracted effective date precedes scan date by more than 365 days.",
        recommendedAction: "Review and refresh the published policy effective date.",
        firstDetectedAt: new Date(),
        lastSeenAt: new Date(),
      },
    });

    const req = new Request("https://api.example.com/api/v1/issues?severity=INFO", {
      headers: { Authorization: `Bearer ${readOnlyKey}` },
    });
    const res = await listIssues(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.pagination.total).toBe(1);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).not.toBe(issue.id);
    expect(body.data[0].severity).toBe("INFO");
  });

  it("never returns another agency's findings", async () => {
    await seedIssue();

    const otherAgency = await makeAgency({ name: "Other Agency" });
    const otherWebsite = await makeWebsite(otherAgency.id);
    await makeScanWithEvidence(otherAgency.id, otherWebsite.id);

    const req = new Request("https://api.example.com/api/v1/issues", {
      headers: { Authorization: `Bearer ${readOnlyKey}` },
    });
    const res = await listIssues(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.pagination.total).toBe(1);
    expect(body.data[0].websiteId).not.toBe(otherWebsite.id);
  });

  it("filters by websiteId", async () => {
    const { website } = await seedIssue();
    const otherWebsite = await makeWebsite(agencyId);
    const otherScan = await makeScanWithEvidence(agencyId, otherWebsite.id);

    const req = new Request(
      `https://api.example.com/api/v1/issues?websiteId=${otherWebsite.id}`,
      { headers: { Authorization: `Bearer ${readOnlyKey}` } },
    );
    const res = await listIssues(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.pagination.total).toBe(1);
    expect(body.data[0].id).toBe(otherScan.issue.id);
    expect(body.data[0].websiteId).not.toBe(website.id);
  });
});
