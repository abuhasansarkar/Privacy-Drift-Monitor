import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../client";
import { forAgency, TENANT_MODELS, TenantIsolationError } from "../tenant";
import {
  makeAgency,
  makeClient,
  makeScanWithEvidence,
  makeWebsite,
  resetDatabase,
} from "../testing/factories";

/**
 * TENANT ISOLATION SUITE — PLAN.md Part 0 §0.2 P3, §5.5, Phase 1 task 1.1.
 *
 * Acceptance criterion (M2): "A second agency cannot see the first's data —
 * asserted in tests, not by inspection."
 *
 * This suite is the assertion. It must pass before any feature ships.
 */

let agencyA: Awaited<ReturnType<typeof makeAgency>>;
let agencyB: Awaited<ReturnType<typeof makeAgency>>;
let siteA: Awaited<ReturnType<typeof makeWebsite>>;
let siteB: Awaited<ReturnType<typeof makeWebsite>>;

beforeAll(async () => {
  await resetDatabase();

  agencyA = await makeAgency({ name: "Agency A" });
  agencyB = await makeAgency({ name: "Agency B" });

  const clientA = await makeClient(agencyA.id, { name: "Client A" });
  const clientB = await makeClient(agencyB.id, { name: "Client B" });

  siteA = await makeWebsite(agencyA.id, { clientId: clientA.id, host: "a.example.test" });
  siteB = await makeWebsite(agencyB.id, { clientId: clientB.id, host: "b.example.test" });

  await makeScanWithEvidence(agencyA.id, siteA.id);
  await makeScanWithEvidence(agencyB.id, siteB.id);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("registry completeness", () => {
  /**
   * Guards against the most likely regression: someone adds a tenant model to
   * schema.prisma and forgets TENANT_MODELS, silently shipping a model with no
   * isolation. This fails CI instead.
   */
  it("every model with an agencyId column is listed in TENANT_MODELS", async () => {
    const rows = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT DISTINCT table_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND column_name = 'agency_id'
    `;

    // agencyId is nullable/global on these by design.
    const INTENTIONAL_EXCEPTIONS = new Set(["system_logs"]);

    const listed = new Set(
      TENANT_MODELS.map((m) => m.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)),
    );

    const missing = rows
      .map((r) => r.table_name)
      .filter((t) => !INTENTIONAL_EXCEPTIONS.has(t))
      .filter((t) => {
        const singularish = t.replace(/_/g, "");
        return ![...listed].some((m) => m.replace(/_/g, "") === singularish.replace(/s$/, "")
          || singularish.startsWith(m.replace(/_/g, "")));
      });

    expect(missing, `Tables with agency_id missing from TENANT_MODELS: ${missing.join(", ")}`)
      .toEqual([]);
  });
});

describe("reads are scoped", () => {
  it("findMany never returns another agency's rows", async () => {
    const db = forAgency(agencyA.id);

    const websites = await db.website.findMany();
    expect(websites).toHaveLength(1);
    expect(websites[0]?.id).toBe(siteA.id);

    const clients = await db.client.findMany();
    expect(clients.every((c) => c.agencyId === agencyA.id)).toBe(true);

    const issues = await db.issue.findMany();
    expect(issues.every((i) => i.agencyId === agencyA.id)).toBe(true);
  });

  it("findFirst cannot reach across tenants even when given the id", async () => {
    const db = forAgency(agencyA.id);
    const found = await db.website.findFirst({ where: { id: siteB.id } });
    expect(found).toBeNull();
  });

  it("findUnique on another tenant's id returns null, not the row", async () => {
    const db = forAgency(agencyA.id);
    const found = await db.website.findUnique({ where: { id: siteB.id } });
    expect(found).toBeNull();
  });

  it("count only counts the caller's rows", async () => {
    expect(await forAgency(agencyA.id).website.count()).toBe(1);
    expect(await forAgency(agencyB.id).website.count()).toBe(1);
  });

  it("nested relation reads do not leak", async () => {
    // The subtle one: a permitted parent must not pull another tenant's children.
    const db = forAgency(agencyA.id);
    const withScans = await db.website.findMany({ include: { scans: true } });
    const allScans = withScans.flatMap((w) => w.scans);
    expect(allScans.length).toBeGreaterThan(0);
    expect(allScans.every((s) => s.agencyId === agencyA.id)).toBe(true);
  });

  it("evidence tables are scoped", async () => {
    const db = forAgency(agencyA.id);
    for (const model of ["networkRequest", "cookieRecord", "issueEvidence", "scanPhase"] as const) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows: any[] = await (db as any)[model].findMany();
      expect(rows.length, `${model} returned nothing — fixture problem`).toBeGreaterThan(0);
      expect(
        rows.every((r) => r.agencyId === agencyA.id),
        `${model} leaked across tenants`,
      ).toBe(true);
    }
  });
});

describe("writes are scoped", () => {
  it("create stamps the caller's agencyId even if another is supplied", async () => {
    const db = forAgency(agencyA.id);
    const created = await db.client.create({
      // @ts-expect-error — deliberately attempting to forge the tenant
      data: { name: "Forged", slug: `forged-${Date.now()}`, agencyId: agencyB.id },
    });
    expect(created.agencyId).toBe(agencyA.id);
  });

  it("updateMany cannot touch another tenant's rows", async () => {
    const db = forAgency(agencyA.id);
    const result = await db.website.updateMany({
      where: { id: siteB.id },
      data: { label: "hijacked" },
    });
    expect(result.count).toBe(0);

    const untouched = await prisma.website.findUnique({ where: { id: siteB.id } });
    expect(untouched?.label).not.toBe("hijacked");
  });

  it("deleteMany cannot delete another tenant's rows", async () => {
    const db = forAgency(agencyA.id);
    const result = await db.website.deleteMany({ where: { id: siteB.id } });
    expect(result.count).toBe(0);
    expect(await prisma.website.findUnique({ where: { id: siteB.id } })).not.toBeNull();
  });

  it("update on another tenant's row throws rather than succeeding", async () => {
    const db = forAgency(agencyA.id);
    await expect(
      db.website.update({ where: { id: siteB.id }, data: { label: "hijacked" } }),
    ).rejects.toThrow(TenantIsolationError);
  });

  it("delete on another tenant's row throws", async () => {
    const db = forAgency(agencyA.id);
    await expect(db.website.delete({ where: { id: siteB.id } })).rejects.toThrow(
      TenantIsolationError,
    );
  });
});

describe("global models are not scoped", () => {
  it("tracker vendors are visible to every agency", async () => {
    await prisma.trackerVendor.upsert({
      where: { slug: "test-vendor" },
      create: {
        slug: "test-vendor",
        name: "Test Vendor",
        category: "ANALYTICS",
        riskLevel: "MEDIUM",
        domainPatterns: ["test.example"],
        scriptPatterns: [],
        cookiePatterns: [],
        storagePatterns: [],
        requestPathPatterns: [],
      },
      update: {},
    });

    const fromA = await forAgency(agencyA.id).trackerVendor.findMany();
    const fromB = await forAgency(agencyB.id).trackerVendor.findMany();
    expect(fromA.length).toBe(fromB.length);
    expect(fromA.length).toBeGreaterThan(0);
  });
});

describe("guard rails", () => {
  it("forAgency rejects an empty agencyId", () => {
    expect(() => forAgency("")).toThrow(TenantIsolationError);
  });
});
