import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../client";
import { repositoriesFor } from "../repositories";
import { makeAgency, makeWebsite, resetDatabase } from "../testing/factories";

/**
 * SCAN PERSISTENCE — Phase 2 task 2.11, against real Postgres.
 *
 * The assertions that matter here are not "rows were written". They are:
 *   - a PARTIAL scan does NOT become the drift baseline
 *   - the denormalized counters agree with the tables they summarise
 *   - evidence is scoped to the agency, like everything else
 *
 * Each of those is a place where a plausible-looking implementation produces a
 * database that lies.
 */

let agencyA: Awaited<ReturnType<typeof makeAgency>>;
let agencyB: Awaited<ReturnType<typeof makeAgency>>;
let websiteId: string;

const phase = (
  name: "NO_CONSENT" | "REJECT_ALL",
  status: "EXECUTED" | "UNDETERMINED",
) => ({
  phase: name,
  status,
  startedAt: new Date("2026-08-30T10:00:00Z"),
  finishedAt: new Date("2026-08-30T10:00:30Z"),
  durationMs: 30_000,
  actionMethod: null,
  actionConfidence: null,
  selectorUsed: null,
  elementText: null,
  inIframe: false,
  bannerDismissed: null,
  errorCode: status === "UNDETERMINED" ? "CONSENT_BUTTON_NOT_FOUND" : null,
  errorMessage: null,
});

const request = (host: string, thirdParty: boolean, consentPhase: "NO_CONSENT") => ({
  pageUrl: "https://acme.test/",
  consentPhase,
  url: `https://${host}/tag.js`,
  method: "GET",
  resourceType: "script",
  host,
  registrableDomain: host,
  isThirdParty: thirdParty,
  status: 200,
  failureText: null,
  initiatorType: "script",
  initiatorUrl: null,
  timestampMs: 120,
  transferSize: null,
  redirectChain: [],
  setCookieCount: 1,
});

beforeAll(async () => {
  await resetDatabase();
  agencyA = await makeAgency({ name: "Agency A" });
  agencyB = await makeAgency({ name: "Agency B" });
  const site = await makeWebsite(agencyA.id, { url: "https://acme.test/" });
  websiteId = site.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("scan persistence", () => {
  it("writes a PARTIAL scan with all of its evidence in one transaction", async () => {
    const repos = repositoriesFor(agencyA.id);
    const scan = await repos.scans.enqueue({
      websiteId,
      trigger: "MANUAL",
      scannerVersion: "1.0.0",
    });
    expect(scan.status).toBe("QUEUED");

    await repos.scans.markRunning(scan.id, "worker-test");

    await repos.scans.complete(
      scan.id,
      {
        status: "PARTIAL",
        startedAt: new Date("2026-08-30T10:00:00Z"),
        finishedAt: new Date("2026-08-30T10:01:00Z"),
        durationMs: 60_000,
        scannerVersion: "1.0.0",
        browserVersion: "151.0",
        workerId: "worker-test",
        userAgent: "test-agent",
        cmp: {
          cmpId: "generic",
          cmpName: "Generic banner",
          version: null,
          confidence: 0.4,
        },
        pagesScanned: 1,
        errorCode: null,
        errorMessage: null,
        errorPhase: null,
      },
      {
        phases: [phase("NO_CONSENT", "EXECUTED"), phase("REJECT_ALL", "UNDETERMINED")],
        requests: [
          request("acme.test", false, "NO_CONSENT"),
          request("tracker.example", true, "NO_CONSENT"),
          request("tracker.example", true, "NO_CONSENT"),
        ],
        cookies: [
          {
            consentPhase: "NO_CONSENT",
            snapshotPoint: "after_nav",
            name: "_ga",
            domain: "acme.test",
            path: "/",
            isSession: false,
            durationDays: 730,
            secure: true,
            httpOnly: false,
            sameSite: "Lax",
            isThirdParty: false,
            valueHash: "h:abc",
            valueLength: 24,
            valueRaw: null,
          },
        ],
        storage: [
          {
            consentPhase: "NO_CONSENT",
            storageType: "local",
            key: "_fbp",
            valueLength: 30,
            valueHash: "h:def",
            origin: "https://acme.test",
          },
        ],
        consoleLogs: [{ level: "error", message: "boom", source: null }],
        screenshots: [],
      },
    );

    const stored = await repos.scans.withPhases(scan.id);
    expect(stored?.status).toBe("PARTIAL");
    expect(stored?.phases).toHaveLength(2);

    // Counters must agree with the tables. A counter written outside the
    // transaction is a counter that eventually disagrees.
    expect(stored?.requestCount).toBe(3);
    expect(stored?.cookieCount).toBe(1);
    expect(stored?.storageKeyCount).toBe(1);
    // Two requests, ONE third-party domain — the count is of domains, not rows.
    expect(stored?.thirdPartyDomainCount).toBe(1);
  });

  it("does NOT make a PARTIAL scan the drift baseline", async () => {
    const website = await prisma.website.findUniqueOrThrow({ where: { id: websiteId } });

    // lastScanAt moves, because a scan did happen and the list should say so.
    expect(website.lastScanAt).not.toBeNull();
    // lastSuccessfulScanAt does NOT, because §4.10 forbids a PARTIAL scan from
    // becoming the baseline a future scan is diffed against.
    expect(website.lastSuccessfulScanAt).toBeNull();
  });

  it("advances the baseline only on a COMPLETED scan", async () => {
    const repos = repositoriesFor(agencyA.id);
    const scan = await repos.scans.enqueue({
      websiteId,
      trigger: "SCHEDULED",
      scannerVersion: "1.0.0",
    });

    await repos.scans.complete(
      scan.id,
      {
        status: "COMPLETED",
        startedAt: new Date("2026-08-30T11:00:00Z"),
        finishedAt: new Date("2026-08-30T11:01:00Z"),
        durationMs: 60_000,
        scannerVersion: "1.0.0",
        browserVersion: "151.0",
        workerId: "worker-test",
        userAgent: "test-agent",
        cmp: null,
        pagesScanned: 1,
        errorCode: null,
        errorMessage: null,
        errorPhase: null,
      },
      {
        phases: [phase("NO_CONSENT", "EXECUTED")],
        requests: [],
        cookies: [],
        storage: [],
        consoleLogs: [],
        screenshots: [],
      },
    );

    const website = await prisma.website.findUniqueOrThrow({ where: { id: websiteId } });
    expect(website.lastSuccessfulScanAt).not.toBeNull();
    expect(website.consecutiveFailures).toBe(0);
  });

  it("scopes scans and their evidence to the agency", async () => {
    const otherAgency = repositoriesFor(agencyB.id);

    expect(await otherAgency.scans.listForWebsite(websiteId)).toHaveLength(0);
    expect(await otherAgency.db.networkRequest.findMany()).toHaveLength(0);
    expect(await otherAgency.db.cookieRecord.findMany()).toHaveLength(0);

    // And the owning agency still sees them — proving the check above is
    // isolation and not an empty database.
    const mine = repositoriesFor(agencyA.id);
    expect((await mine.db.networkRequest.findMany()).length).toBeGreaterThan(0);
  });

  it("paginates recorded requests rather than loading them all", async () => {
    const repos = repositoriesFor(agencyA.id);
    const scans = await repos.scans.listForWebsite(websiteId);
    const partial = scans.find((scan) => scan.status === "PARTIAL");

    const firstPage = await repos.scans.requests(partial!.id, { skip: 0, take: 2 });
    expect(firstPage.total).toBe(3);
    expect(firstPage.items).toHaveLength(2);
  });
});
