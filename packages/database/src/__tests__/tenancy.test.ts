import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../client";
import {
  forAgency,
  GLOBAL_MODELS,
  Prisma,
  TENANT_MODELS,
  TenantIsolationError,
} from "../tenant";
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

/**
 * REGISTRY COMPLETENESS.
 *
 * Driven by the Prisma DMMF rather than by string-munging table names. The
 * previous version compared hand-pluralized snake_case and got both kinds of
 * answer wrong: it reported `storage_entries` / `issue_activities` as missing
 * when they were listed, and — far worse — it passed `AIRequest`, whose client
 * key is `aIRequest` and which was therefore not being scoped at all.
 *
 * These tests need no database, so they fail fast and locally.
 */
describe("registry completeness", () => {
  /** Every model in the generated schema, with its fields. */
  const MODELS = Prisma.dmmf.datamodel.models;

  /** `agencyId` is nullable here by design, for platform-level rows (§5.5). */
  const GLOBAL_WITH_NULLABLE_AGENCY_ID = new Set(["SystemLog"]);

  const lower = (s: string) => s.toLowerCase();
  const tenantSet = new Set(TENANT_MODELS.map(lower));
  const globalSet = new Set(GLOBAL_MODELS.map(lower));

  it("every model with an agencyId field is listed in TENANT_MODELS", () => {
    const missing = MODELS.filter((m) =>
      m.fields.some((f) => f.name === "agencyId"),
    )
      .map((m) => m.name)
      .filter((name) => !GLOBAL_WITH_NULLABLE_AGENCY_ID.has(name))
      .filter((name) => !tenantSet.has(lower(name)));

    expect(
      missing,
      `Models with agencyId missing from TENANT_MODELS: ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("every TENANT_MODELS entry names a real Prisma model", () => {
    // The check that would have caught `aiRequest` vs `AIRequest`: an entry
    // that matches nothing is an entry that scopes nothing.
    const known = new Set(MODELS.map((m) => lower(m.name)));
    const unknown = TENANT_MODELS.filter((m) => !known.has(lower(m)));

    expect(
      unknown,
      `TENANT_MODELS entries that match no model: ${unknown.join(", ")}`,
    ).toEqual([]);
  });

  it("every GLOBAL_MODELS entry names a real Prisma model", () => {
    const known = new Set(MODELS.map((m) => lower(m.name)));
    const unknown = GLOBAL_MODELS.filter((m) => !known.has(lower(m)));

    expect(unknown).toEqual([]);
  });

  it("no model is in both registries", () => {
    const both = TENANT_MODELS.filter((m) => globalSet.has(lower(m)));
    expect(both).toEqual([]);
  });

  it("every model is classified exactly once", () => {
    const unclassified = MODELS.map((m) => m.name).filter(
      (name) => !tenantSet.has(lower(name)) && !globalSet.has(lower(name)),
    );

    expect(
      unclassified,
      `Models in neither TENANT_MODELS nor GLOBAL_MODELS: ${unclassified.join(", ")}`,
    ).toEqual([]);
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
      // Deliberately forging the tenant. This type-checks — `agencyId` is a real
      // field on the unchecked create input — which is exactly why the extension
      // has to overwrite it rather than trusting the caller to omit it.
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

  /**
   * REGRESSION GUARD. An earlier implementation ran the mutation first and
   * verified ownership afterwards, so the row was already modified by the time
   * it threw — and with no transaction, nothing rolled it back. Asserting only
   * "it throws" passed against that broken behaviour.
   *
   * These tests therefore assert the property that actually matters: the other
   * tenant's row is UNCHANGED / STILL PRESENT. Do not weaken them back to a
   * bare rejects.toThrow().
   */
  it("update on another tenant's row rejects AND leaves the row untouched", async () => {
    const db = forAgency(agencyA.id);
    const before = await prisma.website.findUniqueOrThrow({ where: { id: siteB.id } });

    await expect(
      db.website.update({ where: { id: siteB.id }, data: { label: "hijacked" } }),
    ).rejects.toThrow();

    const after = await prisma.website.findUniqueOrThrow({ where: { id: siteB.id } });
    expect(after.label).toBe(before.label);
    expect(after.label).not.toBe("hijacked");
    expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
  });

  it("delete on another tenant's row rejects AND leaves the row present", async () => {
    const db = forAgency(agencyA.id);

    await expect(db.website.delete({ where: { id: siteB.id } })).rejects.toThrow();

    expect(await prisma.website.findUnique({ where: { id: siteB.id } })).not.toBeNull();
  });

  it("upsert cannot create a row attributed to another tenant", async () => {
    const db = forAgency(agencyA.id);
    const slug = `upsert-${Date.now()}`;

    const row = await db.client.upsert({
      where: { agencyId_slug: { agencyId: agencyB.id, slug } },
      // Forged in the create payload too, so the assertion below proves the
      // extension stamps the create path and not just the where clause.
      create: { name: "Upserted", slug, agencyId: agencyB.id },
      update: { name: "Upserted" },
    });

    // The create path must be stamped with the CALLER's agency, not the forged one.
    expect(row.agencyId).toBe(agencyA.id);
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
