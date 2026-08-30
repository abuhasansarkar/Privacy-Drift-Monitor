import type { Client } from "@prisma/client";
import type { TenantClient } from "../tenant";
import { auditRepository } from "./audit.repository";
import {
  isPrismaError,
  PRISMA_UNIQUE_CONFLICT,
  skipTake,
  slugify,
  toOffsetPage,
  type OffsetPage,
} from "./types";

/**
 * CLIENT REPOSITORY — PLAN.md Part III §3.7, feature doc 02-clients.
 *
 * Clients group websites for reporting, portal access and billing reference.
 *
 * ⚠️ `notes` is internal-only. This repository returns the full row because the
 * agency app legitimately shows it; the PORTAL and REPORT paths must project
 * through `clientPortalSchema` (@pdm/schemas/client) rather than passing a row
 * from here straight into a template.
 */

export interface ClientListRow extends Client {
  websiteCount: number;
  /** Average health across scanned websites — see `averageHealth` below. */
  averageHealthScore: number | null;
  openIssueCount: number;
  criticalIssueCount: number;
}

/**
 * Aggregate health is the mean across the client's websites, **excluding sites
 * that have never been scanned** (feature 02 trap).
 *
 * Counting an unscanned site as 0 would drag a healthy client's average down
 * and make the number actively misleading in the one place a client sees it.
 * `null` means "nothing scanned yet" and the UI renders "—", not "0".
 */
function averageHealth(scores: Array<number | null>): number | null {
  const scored = scores.filter((s): s is number => s !== null);
  if (scored.length === 0) return null;
  return Math.round(scored.reduce((a, b) => a + b, 0) / scored.length);
}

/**
 * `agencyId` is passed alongside the already-scoped client because Prisma's
 * query extension rewrites the RUNTIME payload, not the generated input types —
 * `client.create` still requires the tenant column at compile time. Spelling it
 * out here is not a second source of truth: `forAgency()` overwrites `data.agencyId`
 * unconditionally, so a wrong value cannot reach the database.
 */
export function clientRepository(db: TenantClient, agencyId: string) {
  const audit = auditRepository(db);

  /**
   * Finds a free slug for `name` within this agency.
   *
   * The unique index is `(agencyId, slug)`, so this is a best-effort probe and
   * `create` still handles P2002 — two concurrent creates of "Acme" would both
   * see the same free slug here and one must lose.
   */
  async function nextAvailableSlug(name: string): Promise<string> {
    const base = slugify(name);
    const taken = await db.client.findMany({
      where: { slug: { startsWith: base } },
      select: { slug: true },
    });
    const used = new Set(taken.map((c) => c.slug));
    if (!used.has(base)) return base;
    for (let n = 2; n < 1000; n++) {
      const candidate = `${base}-${n}`;
      if (!used.has(candidate)) return candidate;
    }
    return `${base}-${Date.now()}`;
  }

  /**
   * Declared as a named function rather than an object method so the P2002
   * retry below can call it without depending on `this` — a destructured
   * `const { create } = repos.clients` would otherwise break the retry path,
   * and it would break silently, only under a slug collision.
   */
  async function create(
    input: {
      name: string;
      slug?: string;
      logoUrl?: string;
      contactName?: string;
      contactEmail?: string;
      contactPhone?: string;
      notes?: string;
      portalEnabled?: boolean;
    },
    actor: { userId: string; ipHash?: string; userAgent?: string },
    attempt = 0,
  ): Promise<Client> {
    const slug = input.slug ?? (await nextAvailableSlug(input.name));

    try {
      return await db.$transaction(async (tx) => {
        const created = await tx.client.create({
          data: {
            agencyId,
            name: input.name,
            slug,
            logoUrl: input.logoUrl ?? null,
            contactName: input.contactName ?? null,
            contactEmail: input.contactEmail ?? null,
            contactPhone: input.contactPhone ?? null,
            notes: input.notes ?? null,
            portalEnabled: input.portalEnabled ?? false,
          },
        });

        await audit.record(
          {
            action: "client.created",
            entityType: "Client",
            entityId: created.id,
            userId: actor.userId,
            after: { name: created.name, slug: created.slug },
            ipHash: actor.ipHash ?? null,
            userAgent: actor.userAgent ?? null,
          },
          tx,
        );

        return created;
      });
    } catch (e) {
      // Lost the race on (agencyId, slug). Re-probe once; a second collision is
      // vanishingly unlikely and is allowed to surface as a 409.
      if (isPrismaError(e, PRISMA_UNIQUE_CONFLICT) && attempt === 0) {
        return create({ ...input, slug: undefined }, actor, 1);
      }
      throw e;
    }
  }

  return {
    create,

    async list(params: {
      search?: string;
      portalEnabled?: boolean;
      includeArchived: boolean;
      sort: "name" | "createdAt" | "websiteCount" | "healthScore";
      direction: "asc" | "desc";
      page: number;
      perPage: number;
    }): Promise<OffsetPage<ClientListRow>> {
      const where = {
        ...(params.includeArchived ? {} : { archivedAt: null }),
        ...(params.portalEnabled === undefined
          ? {}
          : { portalEnabled: params.portalEnabled }),
        ...(params.search
          ? {
              OR: [
                { name: { contains: params.search, mode: "insensitive" as const } },
                { slug: { contains: params.search, mode: "insensitive" as const } },
              ],
            }
          : {}),
      };

      // `websiteCount` and `healthScore` are computed from the joined websites,
      // so they cannot be ORDER BY'd in SQL without a correlated subquery.
      // Sorting on those two is done in memory over the page's rows; sorting on
      // name/createdAt stays in the database where it belongs.
      const dbSortable = params.sort === "name" || params.sort === "createdAt";

      const [total, rows] = await Promise.all([
        db.client.count({ where }),
        db.client.findMany({
          where,
          include: {
            websites: {
              where: { archivedAt: null },
              select: {
                healthScore: true,
                openIssueCount: true,
                criticalIssueCount: true,
              },
            },
          },
          ...(dbSortable
            ? {
                orderBy:
                  params.sort === "name"
                    ? { name: params.direction }
                    : { createdAt: params.direction },
              }
            : {}),
          ...(dbSortable ? skipTake(params) : {}),
        }),
      ]);

      const mapped: ClientListRow[] = rows.map(({ websites, ...client }) => ({
        ...client,
        websiteCount: websites.length,
        averageHealthScore: averageHealth(websites.map((w) => w.healthScore)),
        openIssueCount: websites.reduce((a, w) => a + w.openIssueCount, 0),
        criticalIssueCount: websites.reduce((a, w) => a + w.criticalIssueCount, 0),
      }));

      if (dbSortable) return toOffsetPage(mapped, total, params);

      const dir = params.direction === "asc" ? 1 : -1;
      mapped.sort((a, b) => {
        if (params.sort === "websiteCount") {
          return (a.websiteCount - b.websiteCount) * dir;
        }
        // Nulls last regardless of direction — "never scanned" is not "worst".
        const av = a.averageHealthScore;
        const bv = b.averageHealthScore;
        if (av === null && bv === null) return 0;
        if (av === null) return 1;
        if (bv === null) return -1;
        return (av - bv) * dir;
      });

      const { skip, take } = skipTake(params);
      return toOffsetPage(mapped.slice(skip, skip + take), total, params);
    },

    /** `null` when it does not exist OR belongs to another tenant (§6.2). */
    async findById(id: string): Promise<Client | null> {
      return db.client.findUnique({ where: { id } });
    },

    async findBySlug(slug: string): Promise<Client | null> {
      return db.client.findFirst({ where: { slug } });
    },

    /** Every website assigned to this client, for the detail page's Websites tab. */
    async withWebsites(id: string) {
      return db.client.findUnique({
        where: { id },
        include: {
          websites: {
            where: { archivedAt: null },
            orderBy: { url: "asc" },
          },
        },
      });
    },

    async update(
      id: string,
      patch: Partial<
        Pick<
          Client,
          | "name"
          | "logoUrl"
          | "contactName"
          | "contactEmail"
          | "contactPhone"
          | "notes"
          | "portalEnabled"
        >
      >,
      actor: { userId: string; ipHash?: string; userAgent?: string },
    ): Promise<Client | null> {
      const before = await db.client.findUnique({ where: { id } });
      if (!before) return null;

      return db.$transaction(async (tx) => {
        const updated = await tx.client.update({ where: { id }, data: patch });

        const portalChanged =
          patch.portalEnabled !== undefined &&
          patch.portalEnabled !== before.portalEnabled;

        await audit.record(
          {
            action: portalChanged
              ? updated.portalEnabled
                ? "client.portal_enabled"
                : "client.portal_disabled"
              : "client.updated",
            entityType: "Client",
            entityId: id,
            userId: actor.userId,
            // Only the changed keys — never the whole row (§10.6).
            before: Object.fromEntries(
              Object.keys(patch).map((k) => [
                k,
                (before as Record<string, unknown>)[k] ?? null,
              ]),
            ),
            after: patch,
            ipHash: actor.ipHash ?? null,
            userAgent: actor.userAgent ?? null,
          },
          tx,
        );

        return updated;
      });
    },

    /**
     * Archive, **not delete**.
     *
     * The client's websites keep their scan history and their reports stay
     * retrievable (feature 02 acceptance criterion). Archiving is reversible;
     * deletion of monitoring history is not, which is why no delete exists here.
     */
    async archive(
      id: string,
      actor: { userId: string; ipHash?: string; userAgent?: string },
    ): Promise<Client | null> {
      const existing = await db.client.findUnique({ where: { id } });
      if (!existing) return null;
      if (existing.archivedAt) return existing;

      return db.$transaction(async (tx) => {
        const archived = await tx.client.update({
          where: { id },
          data: { archivedAt: new Date() },
        });

        await audit.record(
          {
            action: "client.archived",
            entityType: "Client",
            entityId: id,
            userId: actor.userId,
            ipHash: actor.ipHash ?? null,
            userAgent: actor.userAgent ?? null,
          },
          tx,
        );

        return archived;
      });
    },

    async unarchive(id: string): Promise<Client | null> {
      const existing = await db.client.findUnique({ where: { id } });
      if (!existing) return null;
      return db.client.update({ where: { id }, data: { archivedAt: null } });
    },

    /** Seat/limit checks and the "N clients" header count. */
    async countActive(): Promise<number> {
      return db.client.count({ where: { archivedAt: null } });
    },
  };
}

export type ClientRepository = ReturnType<typeof clientRepository>;
