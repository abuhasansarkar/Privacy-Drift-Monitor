import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Job } from "bullmq";
import { prisma } from "@pdm/database";
import { resetDatabase } from "@pdm/database/testing";
import { BrowserPool } from "@pdm/scanner/browser/pool";
import { allowAnyUrl } from "@pdm/scanner/navigate";
import type { FreeScanJobData } from "@pdm/scanner/queue/queues";
import { processFreeScan } from "../free-scan";

/**
 * THE FREE SCAN, END TO END, AGAINST A REAL BROWSER — PLAN.md §3.2,
 * Phase 6 task 6.5.
 *
 * ⚠️ THE DISCLOSURE BOUNDARY IS WHAT THIS SUITE DEFENDS. Feature doc 18:
 * "Domain + tracker name only; no full URLs, no cookie values — prevents
 * scraping our detection logic." The `FreeScanSummary` type has no field for
 * any of that, and the assertion below checks the SERIALISED JSON rather than
 * the object, because what reaches the public API is the row, not the type.
 *
 * ⚠️ `urlGuard: allowAnyUrl` IS FIXTURE-ONLY. §4.15's fixtures are on
 * 127.0.0.1, which the guard blocks by design — and blocks hardest on this
 * surface, which anyone on the internet can reach. `worker/src/index.ts` omits
 * the parameter, so production gets the real guard.
 */

const pool = new BrowserPool({ concurrency: 1 });
const servers: Array<{ close: () => Promise<void> }> = [];

afterAll(async () => {
  await Promise.all(servers.map((server) => server.close()));
  await pool.close();
});

async function fixture(id: Parameters<typeof import("@pdm/scanner/testing/fixture-server").startFixture>[0]) {
  const { startFixture } = await import("@pdm/scanner/testing/fixture-server");
  const server = await startFixture(id);
  servers.push(server);
  return server;
}

async function runAgainst(url: string) {
  const row = await prisma.freeScan.create({
    data: {
      token: `tok-${Math.random().toString(36).slice(2)}`,
      url,
      registrableDomain: "127.0.0.1",
      ipHash: "sha256:test",
      status: "QUEUED",
      expiresAt: new Date(Date.now() + 7 * 86_400_000),
    },
  });

  const job = {
    id: row.id,
    data: { freeScanId: row.id, url, registrableDomain: "127.0.0.1" },
  } as unknown as Job<FreeScanJobData>;

  await processFreeScan(job, {
    pool,
    scannerVersion: "test-1.0.0",
    workerId: "test",
    urlGuard: allowAnyUrl,
  });

  return prisma.freeScan.findUniqueOrThrow({ where: { id: row.id } });
}

describe("processFreeScan", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("scores a page with no trackers and no CMP from the real engine", async () => {
    const server = await fixture("F01");
    const after = await runAgainst(server.origin);

    expect(after.status).toBe("COMPLETED");
    expect(after.resultSummary).toMatchObject({
      trackersBeforeConsent: 0,
      cmpDetected: false,
      partial: false,
    });

    /*
     * ⚠️ 95, NOT 100, AND THAT IS CORRECT. The fixture is served over plain
     * HTTP on 127.0.0.1, so PDM-R022 fires — legitimately — with "this website
     * was reached over an insecure connection". Asserting 100 here would mean
     * asserting that the free scanner runs a WEAKER rule set than the product,
     * which is exactly what it must not do: the number a visitor sees has to be
     * the number they would get after converting.
     *
     * It also catches the two scoring bugs this test found: scoring from the
     * three DISPLAYED findings rather than all of them, and passing an empty
     * phase list (which applied the incomplete-scan cap to every free scan and
     * turned a genuinely clean 100 into a 95 for the wrong reason).
     */
    expect(after.healthScore).toBe(95);
    const summary = after.resultSummary as { topFindings: Array<{ title: string }> };
    expect(summary.topFindings[0]?.title).toContain("insecure connection");
  }, 60_000);

  it("counts what was written before any consent", async () => {
    /*
     * F11 writes a cookie with no consent asked for — the behaviour the whole
     * product exists to surface, and the free result must show it.
     *
     * ⚠️ THIRD-PARTY COUNTS CANNOT BE ASSERTED WITH THIS HARNESS, and that is a
     * property of the fixtures rather than of the code. Every fixture — the
     * page AND its "third party" — is served from `127.0.0.1` on two ports, and
     * `isThirdParty` is decided by REGISTRABLE DOMAIN, which is the same for
     * both. `phase-runner.test.ts` has the same limitation and works around it
     * by asserting the recorded port; the free summary deliberately exposes
     * counts rather than URLs, so there is no port here to assert against.
     */
    const server = await fixture("F11");
    const after = await runAgainst(server.origin);

    expect(after.status).toBe("COMPLETED");
    const summary = after.resultSummary as Record<string, unknown>;
    expect(summary.cookiesBeforeConsent).toBeGreaterThan(0);
  }, 60_000);

  it("⚠️ LEAKS NO URL, COOKIE VALUE, RULE ID OR FINGERPRINT into the stored summary", async () => {
    /*
     * Asserted against the SERIALISED row, not the typed object: what reaches
     * the public endpoint is `resultSummary` as JSON, and a future field added
     * to the type would appear here before anyone noticed it on the page.
     */
    const server = await fixture("F11");
    const after = await runAgainst(server.origin);

    const json = JSON.stringify(after.resultSummary);
    expect(json).not.toContain("http://");
    expect(json).not.toContain("https://");
    expect(json).not.toContain("PDM-R");
    expect(json).not.toMatch(/fingerprint/i);
    expect(json).not.toMatch(/valueHash|cookieValue/i);

    // And the shape is exactly the eight documented fields — nothing extra.
    expect(Object.keys(after.resultSummary as object).sort()).toEqual([
      "cmpDetected",
      "cmpName",
      "cookiesBeforeConsent",
      "findingCount",
      "partial",
      "thirdPartyDomains",
      "topFindings",
      "topTrackers",
      "trackersBeforeConsent",
    ]);
  }, 60_000);

  it("records a FAILED outcome with a machine-readable code, not prose", async () => {
    // Nothing is listening on this port. §3.2 needs the CODE so the page can
    // map it to one of six specific messages — a stored English sentence would
    // bake the copy into a data row and make the SSRF case impossible to keep
    // vague independently of the rest.
    const after = await runAgainst("http://127.0.0.1:1/");

    expect(after.status).toBe("FAILED");
    expect(after.errorCode).toBeTruthy();
    expect(after.resultSummary).toBeNull();
    expect(after.healthScore).toBeNull();
  }, 60_000);

  it("⚠️ AUTO-BLOCKS A DOMAIN AFTER THREE CONSECUTIVE FAILURES, and a success clears it", async () => {
    for (let index = 0; index < 3; index += 1) {
      await runAgainst("http://127.0.0.1:1/");
    }

    const blocked = await prisma.freeScanBlocklist.findUnique({
      where: { registrableDomain: "127.0.0.1" },
    });
    expect(blocked).not.toBeNull();
    expect(blocked?.addedByUserId).toBeNull();

    // A site that was down for a morning must not stay blocked forever.
    const server = await fixture("F01");
    await runAgainst(server.origin);

    expect(
      await prisma.freeScanBlocklist.findUnique({
        where: { registrableDomain: "127.0.0.1" },
      }),
    ).toBeNull();
  }, 120_000);

  it("never clears a block a human added", async () => {
    await prisma.freeScanBlocklist.create({
      data: {
        registrableDomain: "127.0.0.1",
        reason: "abuse report",
        addedByUserId: "user-admin",
      },
    });

    const server = await fixture("F01");
    await runAgainst(server.origin);

    const still = await prisma.freeScanBlocklist.findUnique({
      where: { registrableDomain: "127.0.0.1" },
    });
    expect(still?.addedByUserId).toBe("user-admin");
  }, 60_000);
});
