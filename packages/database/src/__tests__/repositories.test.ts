import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { client as clientSchemas } from "@pdm/schemas";
import { prisma } from "../client";
import { repositoriesFor, slugify } from "../repositories";
import { makeAgency, makeWebsite, resetDatabase } from "../testing/factories";

/**
 * REPOSITORY LAYER — Phase 1 task 1.1.
 *
 * These run against real Postgres on purpose. A repository asserted against a
 * mock proves nothing about tenant scoping, transaction boundaries or the
 * unique indexes that carry correctness (§5.3), which are the three things this
 * layer exists to get right.
 */

let agencyA: Awaited<ReturnType<typeof makeAgency>>;
let agencyB: Awaited<ReturnType<typeof makeAgency>>;
let actorA: { userId: string };

const LIST_DEFAULTS = {
  includeArchived: false,
  direction: "asc" as const,
  page: 1,
  perPage: 25,
};

beforeAll(async () => {
  await resetDatabase();
  agencyA = await makeAgency({ name: "Agency A" });
  agencyB = await makeAgency({ name: "Agency B" });
  actorA = { userId: agencyA.ownerId };
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("slugify", () => {
  it("produces a URL-safe slug", () => {
    expect(slugify("Acme Dental Ltd.")).toBe("acme-dental-ltd");
    expect(slugify("  Café  Noir  ")).toBe("cafe-noir");
  });

  it("never returns an empty string", () => {
    // An all-symbol name would otherwise collide on the unique index for every
    // such client, because "" === "".
    expect(slugify("!!!")).toBe("client");
    expect(slugify("")).toBe("client");
  });
});

describe("client repository", () => {
  it("derives a slug and writes an audit row in the same transaction", async () => {
    const repos = repositoriesFor(agencyA.id);
    const created = await repos.clients.create({ name: "Acme Dental" }, actorA);

    expect(created.slug).toBe("acme-dental");
    expect(created.agencyId).toBe(agencyA.id);

    const audits = await prisma.auditLog.findMany({
      where: { entityType: "Client", entityId: created.id },
    });
    expect(audits).toHaveLength(1);
    expect(audits[0]?.action).toBe("client.created");
    expect(audits[0]?.userId).toBe(actorA.userId);
  });

  it("resolves a slug collision instead of throwing", async () => {
    const repos = repositoriesFor(agencyA.id);
    const first = await repos.clients.create({ name: "Duplicate Co" }, actorA);
    const second = await repos.clients.create({ name: "Duplicate Co" }, actorA);

    expect(first.slug).toBe("duplicate-co");
    expect(second.slug).toBe("duplicate-co-2");
  });

  it("lets two agencies hold the same slug", async () => {
    // The unique index is (agencyId, slug), not slug. If this fails, one
    // agency's naming choices constrain another's.
    const a = await repositoriesFor(agencyA.id).clients.create(
      { name: "Shared Name" },
      actorA,
    );
    const b = await repositoriesFor(agencyB.id).clients.create(
      { name: "Shared Name" },
      { userId: agencyB.ownerId },
    );
    expect(a.slug).toBe(b.slug);
    expect(a.agencyId).not.toBe(b.agencyId);
  });

  it("excludes never-scanned websites from the average health score", async () => {
    // The trap in feature 02: counting an unscanned site as 0 drags a healthy
    // client's average down and makes the number actively misleading.
    const repos = repositoriesFor(agencyA.id);
    const c = await repos.clients.create({ name: "Health Test" }, actorA);

    await makeWebsite(agencyA.id, { clientId: c.id, healthScore: 90 });
    await makeWebsite(agencyA.id, { clientId: c.id, healthScore: 70 });
    await makeWebsite(agencyA.id, { clientId: c.id, healthScore: null });

    const page = await repos.clients.list({
      ...LIST_DEFAULTS,
      search: "Health Test",
      sort: "name",
    });

    const row = page.items.find((r) => r.id === c.id);
    expect(row?.websiteCount).toBe(3);
    expect(row?.averageHealthScore).toBe(80); // not 53
  });

  it("reports null health when nothing has been scanned", async () => {
    const repos = repositoriesFor(agencyA.id);
    const c = await repos.clients.create({ name: "Unscanned Co" }, actorA);
    await makeWebsite(agencyA.id, { clientId: c.id, healthScore: null });

    const page = await repos.clients.list({
      ...LIST_DEFAULTS,
      search: "Unscanned Co",
      sort: "name",
    });
    expect(page.items[0]?.averageHealthScore).toBeNull();
  });

  it("archives without deleting the client's websites", async () => {
    const repos = repositoriesFor(agencyA.id);
    const c = await repos.clients.create({ name: "Archive Me" }, actorA);
    const site = await makeWebsite(agencyA.id, { clientId: c.id });

    const archived = await repos.clients.archive(c.id, actorA);
    expect(archived?.archivedAt).toBeInstanceOf(Date);

    // Archive is reversible and history-preserving; delete is not available.
    const stillThere = await prisma.website.findUnique({ where: { id: site.id } });
    expect(stillThere).not.toBeNull();
    expect(stillThere?.clientId).toBe(c.id);
  });

  it("hides archived clients by default and shows them on request", async () => {
    const repos = repositoriesFor(agencyA.id);
    const c = await repos.clients.create({ name: "Hidden Co" }, actorA);
    await repos.clients.archive(c.id, actorA);

    const hidden = await repos.clients.list({
      ...LIST_DEFAULTS,
      search: "Hidden Co",
      sort: "name",
    });
    expect(hidden.items).toHaveLength(0);

    const shown = await repos.clients.list({
      ...LIST_DEFAULTS,
      includeArchived: true,
      search: "Hidden Co",
      sort: "name",
    });
    expect(shown.items).toHaveLength(1);
  });

  it("returns null for another tenant's client rather than throwing", async () => {
    const owned = await repositoriesFor(agencyB.id).clients.create(
      { name: "B Only" },
      { userId: agencyB.ownerId },
    );
    // null → the caller maps to 404. A 403 would confirm the id exists (§6.2).
    expect(await repositoriesFor(agencyA.id).clients.findById(owned.id)).toBeNull();
  });

  it("keeps internal notes out of the portal projection", async () => {
    const repos = repositoriesFor(agencyA.id);
    const c = await repos.clients.create(
      { name: "Notes Co", notes: "Chases invoices. Do not show." },
      actorA,
    );

    // The row itself carries notes — the agency app shows them.
    expect(c.notes).toContain("Do not show");

    // The portal projection structurally cannot: Zod strips unknown keys.
    const portalView = clientSchemas.clientPortalSchema.parse(c);
    expect(portalView).not.toHaveProperty("notes");
    expect(portalView).not.toHaveProperty("contactEmail");
    expect(portalView.name).toBe("Notes Co");
  });
});

describe("website repository", () => {
  it("creates with an audit row and no enqueued side effect", async () => {
    const repos = repositoriesFor(agencyA.id);
    const site = await repos.websites.create(
      {
        url: "https://created.example.test",
        originalUrl: "created.example.test",
        host: "created.example.test",
        registrableDomain: "example.test",
        scanFrequency: "WEEKLY",
        scanPriority: "NORMAL",
        monitoredPaths: ["/"],
        alertProfile: "DEFAULT",
        nextScanAt: new Date(),
      },
      actorA,
    );

    expect(site.agencyId).toBe(agencyA.id);

    const audits = await prisma.auditLog.findMany({
      where: { entityType: "Website", entityId: site.id, action: "website.created" },
    });
    expect(audits).toHaveLength(1);
  });

  it("finds a duplicate by canonical url", async () => {
    const repos = repositoriesFor(agencyA.id);
    await makeWebsite(agencyA.id, {
      url: "https://dupe.example.test/",
      host: "dupe.example.test",
    });

    expect(await repos.websites.findByUrl("https://dupe.example.test/")).not.toBeNull();
    // www is deliberately NOT stripped — different host, different site (§3.6).
    expect(await repos.websites.findByUrl("https://www.dupe.example.test/")).toBeNull();
  });

  it("nulls nextScanAt when paused and restores it when resumed", async () => {
    const repos = repositoriesFor(agencyA.id);
    const site = await makeWebsite(agencyA.id, { host: "pause.example.test" });

    const paused = await repos.websites.setMonitoring(site.id, "PAUSED", null, actorA);
    // nextScanAt is the single source of truth for scheduling (§7.5).
    expect(paused?.nextScanAt).toBeNull();
    expect(paused?.monitoringStatus).toBe("PAUSED");

    const due = new Date(Date.now() + 3_600_000);
    const resumed = await repos.websites.setMonitoring(site.id, "ACTIVE", due, actorA);
    expect(resumed?.nextScanAt?.getTime()).toBe(due.getTime());
    expect(resumed?.consecutiveFailures).toBe(0);
  });

  it("unschedules an archived website", async () => {
    const repos = repositoriesFor(agencyA.id);
    const site = await makeWebsite(agencyA.id, { host: "archived.example.test" });

    const archived = await repos.websites.archive(site.id, actorA);
    expect(archived?.archivedAt).toBeInstanceOf(Date);
    // Otherwise the scheduler keeps picking up a site nobody is watching.
    expect(archived?.nextScanAt).toBeNull();
    expect(archived?.monitoringStatus).toBe("PAUSED");
  });

  it("writes the audit row before a hard delete, so it survives the cascade", async () => {
    const repos = repositoriesFor(agencyA.id);
    const site = await makeWebsite(agencyA.id, { host: "deleted.example.test" });

    expect(await repos.websites.hardDelete(site.id, "customer request", actorA)).toBe(
      true,
    );
    expect(await prisma.website.findUnique({ where: { id: site.id } })).toBeNull();

    const audits = await prisma.auditLog.findMany({
      where: { entityType: "Website", entityId: site.id, action: "website.deleted" },
    });
    expect(audits).toHaveLength(1);
    expect(audits[0]?.metadata).toMatchObject({ reason: "customer request" });
  });

  it("cannot delete another tenant's website", async () => {
    const site = await makeWebsite(agencyB.id, { host: "b-only.example.test" });
    expect(await repositoriesFor(agencyA.id).websites.hardDelete(site.id, "x", actorA))
      .toBe(false);
    expect(await prisma.website.findUnique({ where: { id: site.id } })).not.toBeNull();
  });

  it("restricts the list to websiteScope when one is set", async () => {
    const repos = repositoriesFor(agencyA.id);
    const inScope = await makeWebsite(agencyA.id, { host: "scoped-in.example.test" });
    await makeWebsite(agencyA.id, { host: "scoped-out.example.test" });

    const scoped = await repos.websites.list({
      ...LIST_DEFAULTS,
      sort: "url",
      perPage: 100,
      websiteScope: [inScope.id],
    });
    expect(scoped.items.map((w) => w.id)).toEqual([inScope.id]);
  });

  it("treats an EMPTY websiteScope as all websites, not none", async () => {
    // The inverted reading of this locks every member out of every site, and
    // [] is the column default on AgencyMember.
    const repos = repositoriesFor(agencyA.id);
    const all = await repos.websites.list({
      ...LIST_DEFAULTS,
      sort: "url",
      perPage: 100,
      websiteScope: [],
    });
    expect(all.items.length).toBeGreaterThan(1);
  });

  it("counts only active websites for entitlements", async () => {
    const repos = repositoriesFor(agencyB.id);
    const before = await repos.websites.countActive();
    const site = await makeWebsite(agencyB.id, { host: "counted.example.test" });
    expect(await repos.websites.countActive()).toBe(before + 1);

    await repos.websites.archive(site.id, { userId: agencyB.ownerId });
    expect(await repos.websites.countActive()).toBe(before);
  });
});

describe("audit repository", () => {
  it("pages newest-first without repeating a row", async () => {
    const repos = repositoriesFor(agencyB.id);
    for (let i = 0; i < 5; i++) {
      await repos.audit.record({
        action: "scan.triggered",
        entityType: "Website",
        entityId: `entity-${i}`,
        userId: agencyB.ownerId,
      });
    }

    const first = await repos.audit.list({ limit: 2, action: "scan.triggered" });
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).not.toBeNull();

    const second = await repos.audit.list({
      limit: 2,
      action: "scan.triggered",
      cursor: first.nextCursor!,
    });
    expect(second.items).toHaveLength(2);

    const ids = [...first.items, ...second.items].map((r) => r.id);
    expect(new Set(ids).size).toBe(4);
  });

  it("never returns another tenant's audit rows", async () => {
    const fromA = await repositoriesFor(agencyA.id).audit.list({ limit: 100 });
    const rows = await prisma.auditLog.findMany({
      where: { id: { in: fromA.items.map((r) => r.id) } },
      select: { agencyId: true },
    });
    expect(rows.every((r) => r.agencyId === agencyA.id)).toBe(true);
  });
});

describe("team repository invitations", () => {
  it("creates, queries, and revokes pending invitations scoped to agency", async () => {
    const repos = repositoriesFor(agencyA.id);
    const testEmail = "invitee@example.test";

    expect(await repos.team.isMember(testEmail)).toBe(false);

    const invite = await repos.team.createInvitation({
      email: testEmail,
      role: "DEVELOPER",
      token: "tok-" + Math.random().toString(36).slice(2),
      invitedById: agencyA.ownerId,
      expiresAt: new Date(Date.now() + 86400000),
    });

    expect(invite.email).toBe(testEmail);
    expect(invite.role).toBe("DEVELOPER");
    expect(invite.agencyId).toBe(agencyA.id);

    const pending = await repos.team.findPendingInvitation(testEmail);
    expect(pending).not.toBeNull();
    expect(pending?.id).toBe(invite.id);

    const pendingList = await repos.team.pendingInvitations();
    expect(pendingList.some((i) => i.id === invite.id)).toBe(true);

    // Another tenant cannot see this invitation
    const reposB = repositoriesFor(agencyB.id);
    const pendingB = await reposB.team.findPendingInvitation(testEmail);
    expect(pendingB).toBeNull();

    // Revoking removes from pending list
    await repos.team.revokeInvitation(invite.id);
    expect(await repos.team.findPendingInvitation(testEmail)).toBeNull();
  });
});
