import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@pdm/database";
import {
  makeAgency,
  makeScan,
  makeScanWithEvidence,
  makeWebsite,
  resetDatabase,
} from "@pdm/database/testing";

/**
 * RETENTION — PLAN.md §5.8, Phase 6 task 6.9.
 *
 * ⚠️ THIS JOB PERMANENTLY DELETES CUSTOMER DATA, so every assertion here is
 * about a boundary: what it must remove (an obligation), and what it must never
 * remove (evidence behind an open issue). There is no undo for either mistake,
 * and the second one silently guts the evidence chain the entire product rests
 * on — an issue whose proof has been deleted is an accusation with nothing
 * behind it.
 *
 * ⚠️ OBJECT STORAGE IS STUBBED. A retention test that needs MinIO running is a
 * test that gets skipped, and this is the one suite that must not be.
 */
const deletePrefix = vi.fn(async () => 1);
vi.mock("@pdm/storage", () => ({
  objectStore: () => ({ deletePrefix }),
}));

const { runRetention } = await import("../cleanup");

const NOW = new Date("2026-09-15T02:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

/** Starter: 30-day evidence, 365-day history. */
async function subscribeStarter(agencyId: string) {
  const plan = await prisma.plan.findUniqueOrThrow({ where: { key: "starter" } });
  return prisma.subscription.create({
    data: {
      agencyId,
      planId: plan.id,
      stripeCustomerId: `cus_${agencyId}`,
      status: "ACTIVE",
    },
  });
}

async function agencyWithSite() {
  const agency = await makeAgency();
  await subscribeStarter(agency.id);
  const website = await makeWebsite(agency.id);
  return { agency, website };
}

/** `createdAt` has a default, so it is backdated after creation. */
async function backdate(scanId: string, days: number) {
  await prisma.scan.update({
    where: { id: scanId },
    data: { createdAt: daysAgo(days) },
  });
}

describe("runRetention", () => {
  beforeEach(async () => {
    await resetDatabase();
    deletePrefix.mockClear();
  });

  it("leaves a scan inside the evidence window completely alone", async () => {
    const { agency, website } = await agencyWithSite();
    const scan = await makeScan(agency.id, website.id);
    await backdate(scan.id, 10);
    await prisma.networkRequest.create({
      data: {
        scanId: scan.id,
        agencyId: agency.id,
        pageUrl: "https://example.test/",
        consentPhase: "NO_CONSENT",
        url: "https://cdn.example.test/a.js",
        method: "GET",
        resourceType: "script",
        host: "cdn.example.test",
        registrableDomain: "example.test",
        isThirdParty: false,
        timestampMs: 10,
      },
    });

    await runRetention(NOW);

    expect(await prisma.networkRequest.count({ where: { scanId: scan.id } })).toBe(1);
    const after = await prisma.scan.findUniqueOrThrow({ where: { id: scan.id } });
    expect(after.evidencePrunedAt).toBeNull();
  });

  it("strips evidence past the 30-day window but keeps the scan and its score", async () => {
    const { agency, website } = await agencyWithSite();
    const scan = await makeScan(agency.id, website.id, { healthScore: 64 });
    await backdate(scan.id, 40);
    await prisma.cookieRecord.create({
      data: {
        scanId: scan.id,
        agencyId: agency.id,
        consentPhase: "NO_CONSENT",
        snapshotPoint: "phase_end",
        name: "_ga",
        domain: ".example.test",
        path: "/",
        isSession: false,
        secure: true,
        httpOnly: false,
        sameSite: "Lax",
        isThirdParty: false,
        valueHash: "sha256:x",
        valueLength: 8,
        category: "ANALYTICS",
      },
    });

    const result = await runRetention(NOW);

    expect(result.agencies[0]?.scansStripped).toBe(1);
    expect(await prisma.cookieRecord.count({ where: { scanId: scan.id } })).toBe(0);

    /*
     * ⚠️ THE SCAN SURVIVES, AND SO DOES ITS SCORE. §4.13 sells two horizons —
     * 30 days of evidence and 12 months of history — precisely so the health
     * trend still has a line to draw after the megabytes are gone. Deleting the
     * scan at the evidence horizon would collapse the two and silently truncate
     * every chart to one month.
     */
    const after = await prisma.scan.findUniqueOrThrow({ where: { id: scan.id } });
    expect(after.healthScore).toBe(64);
    expect(after.evidencePrunedAt).not.toBeNull();
  });

  it("⚠️ NEVER TOUCHES EVIDENCE BEHIND AN OPEN ISSUE, however old the scan", async () => {
    /*
     * THE ASSERTION THIS WHOLE JOB IS WRITTEN AROUND. `IssueEvidence.scanId`
     * CASCADES: one careless `scan.deleteMany` takes the immutable proof behind
     * every issue that cites it, and the issue is left making a claim with
     * nothing to support it.
     */
    const { agency, website } = await agencyWithSite();
    const { scan, issue } = await makeScanWithEvidence(agency.id, website.id);
    // Older than BOTH horizons — evidence (30d) and history (365d).
    await backdate(scan.id, 900);

    const result = await runRetention(NOW);

    expect(await prisma.scan.count({ where: { id: scan.id } })).toBe(1);
    expect(await prisma.issueEvidence.count({ where: { issueId: issue.id } })).toBe(1);
    expect(await prisma.networkRequest.count({ where: { scanId: scan.id } })).toBe(1);
    expect(result.agencies[0]?.scansExempt).toBe(1);
    expect(result.agencies[0]?.scansDeleted).toBe(0);
  });

  it("does exempt a RESOLVED issue's scan — otherwise nothing is ever deletable", async () => {
    // §5.8 says "open issues". Exempting resolved ones too would retain evidence
    // forever for any site that ever had a finding, which is every site.
    const { agency, website } = await agencyWithSite();
    const { scan, issue } = await makeScanWithEvidence(agency.id, website.id);
    await prisma.issue.update({ where: { id: issue.id }, data: { status: "RESOLVED" } });
    await backdate(scan.id, 900);

    const result = await runRetention(NOW);

    expect(result.agencies[0]?.scansDeleted).toBe(1);
    expect(await prisma.scan.count({ where: { id: scan.id } })).toBe(0);
  });

  it("deletes a scan past the 365-day history horizon and its object-store prefix", async () => {
    const { agency, website } = await agencyWithSite();
    const scan = await makeScan(agency.id, website.id);
    await backdate(scan.id, 400);
    await prisma.screenshot.create({
      data: {
        scanId: scan.id,
        agencyId: agency.id,
        consentPhase: "NO_CONSENT",
        kind: "FULL_PAGE",
        s3Key: `agencies/${agency.id}/websites/${website.id}/scans/${scan.id}/NO_CONSENT-FULL_PAGE.png`,
        width: 1440,
        height: 900,
        sizeBytes: 1024,
      },
    });

    const result = await runRetention(NOW);

    expect(result.agencies[0]?.scansDeleted).toBe(1);
    expect(await prisma.scan.count({ where: { id: scan.id } })).toBe(0);
    // One prefix delete per scan, not one per screenshot — see the note in the job.
    expect(deletePrefix).toHaveBeenCalledWith(
      `agencies/${agency.id}/websites/${website.id}/scans/${scan.id}/`,
    );
  });

  it("is idempotent — a second run strips nothing further", async () => {
    const { agency, website } = await agencyWithSite();
    const scan = await makeScan(agency.id, website.id);
    await backdate(scan.id, 40);

    const first = await runRetention(NOW);
    const second = await runRetention(NOW);

    expect(first.agencies[0]?.scansStripped).toBe(1);
    // Without `evidencePrunedAt` this re-issues five DELETEs per scan every
    // night for the remaining years of that scan's history.
    expect(second.agencies[0]?.scansStripped).toBe(0);
  });

  it("purges free scans after 7 days and keeps newer ones", async () => {
    await prisma.freeScan.createMany({
      data: [
        {
          token: "old-token",
          url: "https://old.test/",
          registrableDomain: "old.test",
          ipHash: "sha256:old",
          createdAt: daysAgo(9),
          expiresAt: daysAgo(2),
        },
        {
          token: "new-token",
          url: "https://new.test/",
          registrableDomain: "new.test",
          ipHash: "sha256:new",
          createdAt: daysAgo(2),
          expiresAt: new Date(NOW.getTime() + 5 * 86_400_000),
        },
      ],
    });

    const result = await runRetention(NOW);

    expect(result.freeScansPurged).toBe(1);
    expect(await prisma.freeScan.count()).toBe(1);
  });

  it("writes the SystemLog summary §5.8 requires", async () => {
    const { agency, website } = await agencyWithSite();
    const scan = await makeScan(agency.id, website.id);
    await backdate(scan.id, 40);

    await runRetention(NOW);

    const log = await prisma.systemLog.findFirstOrThrow({
      where: { service: "retention" },
    });
    // Without a record of what was removed, a retention bug is undetectable
    // after the fact — the evidence of the mistake is the data that is gone.
    expect(log.context).toMatchObject({ scansStripped: 1 });
  });
});
