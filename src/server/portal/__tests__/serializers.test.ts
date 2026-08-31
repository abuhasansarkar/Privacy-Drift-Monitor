import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@pdm/database";
import {
  makeAgency,
  makeClient,
  makeScanWithEvidence,
  makeWebsite,
  resetDatabase,
} from "@pdm/database/testing";
import { repositoriesFor } from "@pdm/database/repositories";
import {
  getPortalIssues,
  getPortalOverview,
  getPortalReportForDownload,
  getPortalReports,
  getPortalScans,
} from "../serializers";
import { consumeMagicLink, hashToken, newToken } from "../session";

/**
 * PORTAL SECURITY — PLAN.md §6.10, feature doc 15's required tests:
 *
 *   "Serializer omits every forbidden field — assert on the JSON, not the render"
 *   "Session scoping: a portal session for client A cannot read client B"
 *   "Revocation invalidates in-flight sessions"
 *
 * ⚠️ ASSERTED ON THE SERIALISED PAYLOAD, not on rendered markup. §6.10 requires
 * the forbidden fields to be *structurally absent*: a test that scraped the HTML
 * would pass just as happily against a template that merely hid them, which is
 * the exact failure the separate serializer exists to prevent.
 */

let agency: Awaited<ReturnType<typeof makeAgency>>;
let clientA: Awaited<ReturnType<typeof makeClient>>;
let clientB: Awaited<ReturnType<typeof makeClient>>;
let sessionA: {
  portalUserId: string;
  agencyId: string;
  clientId: string;
  email: string;
  name: string | null;
};

/**
 * Every field §3.13 puts on the never-exposed list, plus the internal
 * identifiers a client-facing payload has no reason to carry.
 */
const FORBIDDEN_KEYS = [
  "ruleId",
  "ruleVersion",
  "fingerprint",
  "technicalReason",
  "recommendedAction",
  "assignedToId",
  "ignoreReason",
  "resolutionNote",
  "confidence",
  "s3Key",
  "brandingSnapshot",
  "scannerVersion",
  "workerId",
  "browserVersion",
  "errorCode",
  "errorMessage",
  "agencyId",
  "addedItems",
  "removedItems",
  "beforeValue",
  "afterValue",
  "valueRaw",
  "valueHash",
  "payload",
  "idempotencyKey",
];

/** Walks the whole payload — a forbidden key nested three levels down still leaks. */
function collectKeys(value: unknown, into = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, into);
    return into;
  }
  if (value && typeof value === "object" && !(value instanceof Date)) {
    for (const [key, nested] of Object.entries(value)) {
      into.add(key);
      collectKeys(nested, into);
    }
  }
  return into;
}

beforeAll(async () => {
  await resetDatabase();
  agency = await makeAgency({ name: "Northlight Digital" });
  clientA = await makeClient(agency.id, { name: "Acme Dental" });
  clientB = await makeClient(agency.id, { name: "Beta Bakery" });

  const siteA = await makeWebsite(agency.id, {
    clientId: clientA.id,
    url: "https://acme.test",
  });
  const siteB = await makeWebsite(agency.id, {
    clientId: clientB.id,
    url: "https://beta.test",
  });

  await makeScanWithEvidence(agency.id, siteA.id);
  await makeScanWithEvidence(agency.id, siteB.id);

  const repos = repositoriesFor(agency.id);
  for (const [client, name] of [
    [clientA, "Acme report"],
    [clientB, "Beta report"],
  ] as const) {
    const report = await repos.reports.create({
      type: "MONTHLY_MONITORING",
      name,
      clientId: client.id,
      websiteId: null,
      createdById: agency.ownerId,
      periodStart: new Date("2026-03-01"),
      periodEnd: new Date("2026-03-31"),
      options: {} as never,
      idempotencyKey: `portal-test-${client.id}`,
    });
    await repos.reports.markReady(report.id, {
      s3Key: `agencies/${agency.id}/reports/${report.id}.pdf`,
      sizeBytes: 1024,
      pageCount: 2,
      brandingSnapshot: { agencyId: agency.id, primaryColor: "#1D4ED8" } as never,
      generatedAt: new Date(),
    });
  }

  // A real magic-link round trip, so the session under test is one the
  // production path would actually have produced.
  const token = newToken();
  const portalUser = await prisma.portalUser.create({
    data: {
      agencyId: agency.id,
      clientId: clientA.id,
      email: "sarah@acme.test",
      name: "Sarah",
      invitedById: agency.ownerId,
      inviteToken: hashToken(token),
      inviteExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
      status: "INVITED",
    },
  });
  const consumed = await consumeMagicLink(token, { ipHash: null, userAgent: null });
  sessionA = consumed.context;
  expect(sessionA.portalUserId).toBe(portalUser.id);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("session scoping", () => {
  it("returns only the session's own client's findings", async () => {
    const issues = await getPortalIssues(sessionA);
    expect(issues.length).toBeGreaterThan(0);
    for (const issue of issues) {
      expect(issue.websiteLabel).toContain("acme.test");
      expect(issue.websiteLabel).not.toContain("beta.test");
    }
  });

  it("returns only the session's own client's reports", async () => {
    const reports = await getPortalReports(sessionA);
    expect(reports.map((report) => report.name)).toEqual(["Acme report"]);
  });

  it("returns only the session's own client's checks", async () => {
    const scans = await getPortalScans(sessionA);
    expect(scans.length).toBe(1);
  });

  it("refuses another client's report by id, even inside the same agency", async () => {
    const betaReport = await prisma.report.findFirstOrThrow({
      where: { clientId: clientB.id },
    });
    // ⚠️ Same agency, different client. A tenant-only check would let this
    // through — "other clients' anything" is on the never-exposed list.
    expect(await getPortalReportForDownload(sessionA, betaReport.id)).toBeNull();

    const acmeReport = await prisma.report.findFirstOrThrow({
      where: { clientId: clientA.id },
    });
    expect(await getPortalReportForDownload(sessionA, acmeReport.id)).not.toBeNull();
  });
});

describe("forbidden fields are structurally absent", () => {
  it("from the overview payload", async () => {
    const overview = await getPortalOverview(sessionA);
    const keys = collectKeys(overview);
    for (const forbidden of FORBIDDEN_KEYS) {
      expect(keys.has(forbidden), `"${forbidden}" present in the overview`).toBe(false);
    }
  });

  it("from the issue payload", async () => {
    const keys = collectKeys(await getPortalIssues(sessionA));
    for (const forbidden of FORBIDDEN_KEYS) {
      expect(keys.has(forbidden), `"${forbidden}" present in issues`).toBe(false);
    }
  });

  it("from the report and scan payloads", async () => {
    const keys = collectKeys([
      await getPortalReports(sessionA),
      await getPortalScans(sessionA),
    ]);
    for (const forbidden of FORBIDDEN_KEYS) {
      expect(keys.has(forbidden), `"${forbidden}" present in reports/scans`).toBe(false);
    }
  });

  it("survives JSON serialisation — nothing hides in a getter", async () => {
    const raw = JSON.stringify(await getPortalOverview(sessionA));
    for (const forbidden of FORBIDDEN_KEYS) {
      expect(raw.includes(`"${forbidden}"`), `"${forbidden}" in the JSON`).toBe(false);
    }
  });
});

describe("plain language (§3.13)", () => {
  it("maps severity to plain words, never the internal enum", async () => {
    const issues = await getPortalIssues(sessionA);
    const words = new Set(issues.map((issue) => issue.severityWord));
    for (const word of words) {
      expect(["Needs attention", "Worth reviewing", "Informational"]).toContain(word);
    }
  });

  it("interprets the score without comparing to anyone else", async () => {
    const overview = await getPortalOverview(sessionA);
    expect(overview.scoreInterpretation.length).toBeGreaterThan(0);
    // No benchmark language: we have no industry baseline and must not imply one.
    for (const term of ["average", "compared", "benchmark", "other clients", "percentile"]) {
      expect(overview.scoreInterpretation.toLowerCase()).not.toContain(term);
    }
  });
});

describe("magic links and revocation", () => {
  it("burns the magic link on use — a forwarded link cannot be replayed", async () => {
    const token = newToken();
    await prisma.portalUser.update({
      where: { id: sessionA.portalUserId },
      data: {
        inviteToken: hashToken(token),
        inviteExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
      },
    });

    await consumeMagicLink(token, { ipHash: null, userAgent: null });
    await expect(
      consumeMagicLink(token, { ipHash: null, userAgent: null }),
    ).rejects.toThrow();
  });

  it("rejects an expired magic link", async () => {
    const token = newToken();
    await prisma.portalUser.update({
      where: { id: sessionA.portalUserId },
      data: {
        inviteToken: hashToken(token),
        inviteExpiresAt: new Date(Date.now() - 1000),
      },
    });
    await expect(
      consumeMagicLink(token, { ipHash: null, userAgent: null }),
    ).rejects.toThrow();
  });

  it("revocation deletes every session in the same transaction", async () => {
    const before = await prisma.portalSession.count({
      where: { portalUserId: sessionA.portalUserId },
    });
    expect(before).toBeGreaterThan(0);

    const revoked = await repositoriesFor(agency.id).portal.revoke(
      sessionA.portalUserId,
      new Date(),
    );
    expect(revoked).toBe(true);

    expect(
      await prisma.portalSession.count({ where: { portalUserId: sessionA.portalUserId } }),
    ).toBe(0);

    const row = await prisma.portalUser.findUniqueOrThrow({
      where: { id: sessionA.portalUserId },
    });
    expect(row.status).toBe("REVOKED");
    // The invite token is cleared too — a revoked contact's outstanding link
    // must stop working, not merely their live sessions.
    expect(row.inviteToken).toBeNull();
  });

  it("a revoked contact cannot consume a new link", async () => {
    const token = newToken();
    await prisma.portalUser.update({
      where: { id: sessionA.portalUserId },
      data: {
        inviteToken: hashToken(token),
        inviteExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
      },
    });
    // `revokedAt` is set, and `consumeMagicLink` filters on it.
    await expect(
      consumeMagicLink(token, { ipHash: null, userAgent: null }),
    ).rejects.toThrow();
  });
});
