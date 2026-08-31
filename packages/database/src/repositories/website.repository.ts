import type {
  MonitoringStatus,
  Prisma,
  ScanFrequency,
  ScanPriority,
  ScreenshotPolicy,
  Website,
} from "@prisma/client";
import type { TenantClient } from "../tenant";
import { auditRepository } from "./audit.repository";
import {
  isPrismaError,
  PRISMA_UNIQUE_CONFLICT,
  skipTake,
  toOffsetPage,
  type OffsetPage,
} from "./types";

/**
 * WEBSITE REPOSITORY — PLAN.md Part III §3.6, §5.4, §5.6, feature doc 03.
 *
 * The monitored target. Everything downstream — scans, evidence, issues, drift,
 * reports — hangs off a row created here.
 *
 * ⚠️ **This repository never enqueues a scan.** §5.6 is explicit: "never enqueue
 * a BullMQ job inside a database transaction. If the transaction rolls back,
 * the job still exists and will operate on data that was never committed."
 * `create()` returns the row; the service enqueues after the commit.
 */

export interface WebsiteListRow extends Website {
  client: { id: string; name: string } | null;
  group: { id: string; name: string; color: string | null } | null;
}

/**
 * WEBSITE-SCOPE RESTRICTION (§6.2).
 *
 * A member may be limited to specific websites. An EMPTY array means ALL
 * websites in the agency, not none — inverting that reading would silently lock
 * every member out of every site, since `[]` is the column default.
 *
 * ⚠️ DIVERGENCE FROM §6.2, deliberate and worth knowing: the plan says enforce
 * this inside `forAgency()`. It is enforced here and in `requireWebsiteAccess()`
 * instead. Doing it inside the extension means composing an `id IN (...)`
 * predicate for `Website` with a `websiteId IN (...)` predicate for seven child
 * models — two of which (`IgnoreRule`, `Report`) have a NULLABLE `websiteId`
 * where null means "agency-wide" and must stay visible. Getting that wrong
 * inside the single tenant-enforcement point is a worse failure than keeping
 * the rule visible at the query sites that need it. Revisit once there is a
 * test harness that can prove the composed predicate.
 */
function scopePredicate(websiteScope: readonly string[]) {
  return websiteScope.length === 0 ? {} : { id: { in: [...websiteScope] } };
}

type WebsiteSortField =
  | "url"
  | "healthScore"
  | "lastScanAt"
  | "openIssueCount"
  | "createdAt";

/**
 * `nulls: "last"` is only a legal ordering option on a NULLABLE column, so it
 * cannot be applied blindly to every sort field.
 *
 * It matters on the two that are nullable: a website that has never been
 * scanned has no score and no last-scan time, and sorting it to the top of
 * "worst health first" would put unknowns where the problems should be.
 */
function websiteOrderBy(
  sort: WebsiteSortField,
  direction: "asc" | "desc",
): Prisma.WebsiteOrderByWithRelationInput {
  switch (sort) {
    case "healthScore":
      return { healthScore: { sort: direction, nulls: "last" } };
    case "lastScanAt":
      return { lastScanAt: { sort: direction, nulls: "last" } };
    case "openIssueCount":
      return { openIssueCount: direction };
    case "createdAt":
      return { createdAt: direction };
    case "url":
    default:
      return { url: direction };
  }
}

/**
 * `agencyId` is passed explicitly alongside the already-scoped client.
 *
 * Not redundant: `forAgency()` injects its predicate at the TOP LEVEL of
 * `where`, which is the right shape for a filter but cannot fill in the
 * `agencyId` field *inside* a compound unique selector like
 * `agencyId_periodStart_metric`. Metering needs that selector, so the id has to
 * be available as a value. The extension still enforces isolation — this is
 * only how we name the row we mean.
 */
export function websiteRepository(db: TenantClient, agencyId: string) {
  const audit = auditRepository(db);

  return {
    async list(params: {
      search?: string;
      clientId?: string;
      groupId?: string;
      status?: MonitoringStatus;
      minHealthScore?: number;
      maxHealthScore?: number;
      includeArchived: boolean;
      sort: WebsiteSortField;
      direction: "asc" | "desc";
      page: number;
      perPage: number;
      /** Empty = all websites in the agency. See `scopePredicate`. */
      websiteScope?: readonly string[];
    }): Promise<OffsetPage<WebsiteListRow>> {
      const where: Prisma.WebsiteWhereInput = {
        ...scopePredicate(params.websiteScope ?? []),
        ...(params.includeArchived ? {} : { archivedAt: null }),
        ...(params.clientId ? { clientId: params.clientId } : {}),
        ...(params.groupId ? { groupId: params.groupId } : {}),
        ...(params.status ? { monitoringStatus: params.status } : {}),
        ...(params.minHealthScore !== undefined || params.maxHealthScore !== undefined
          ? {
              healthScore: {
                ...(params.minHealthScore !== undefined
                  ? { gte: params.minHealthScore }
                  : {}),
                ...(params.maxHealthScore !== undefined
                  ? { lte: params.maxHealthScore }
                  : {}),
              },
            }
          : {}),
        ...(params.search
          ? {
              OR: [
                { url: { contains: params.search, mode: "insensitive" } },
                { host: { contains: params.search, mode: "insensitive" } },
                { label: { contains: params.search, mode: "insensitive" } },
              ],
            }
          : {}),
      };

      const [total, items] = await Promise.all([
        db.website.count({ where }),
        db.website.findMany({
          where,
          include: {
            client: { select: { id: true, name: true } },
            group: { select: { id: true, name: true, color: true } },
          },
          orderBy: websiteOrderBy(params.sort, params.direction),
          ...skipTake(params),
        }),
      ]);

      return toOffsetPage(items, total, params);
    },

    /** `null` when it does not exist OR belongs to another tenant (§6.2 → 404). */
    async findById(id: string): Promise<Website | null> {
      return db.website.findUnique({ where: { id } });
    },

    /**
     * Duplicate detection for the Add Website wizard.
     *
     * Matches on the CANONICAL url, which is what `@@unique([agencyId, url])`
     * indexes. `www.x.com` and `x.com` are deliberately different sites — they
     * can serve different tags, and merging them would fuse two tracking
     * profiles into one misleading history (§3.6).
     */
    async findByUrl(url: string): Promise<Website | null> {
      return db.website.findFirst({ where: { url } });
    },

    /**
     * Creates the website, its audit row and its usage counter in ONE
     * transaction (§5.6). Returns the row; the caller enqueues the baseline
     * scan **after** this resolves.
     */
    async create(
      input: {
        url: string;
        originalUrl: string;
        host: string;
        registrableDomain: string;
        clientId?: string | null;
        groupId?: string | null;
        label?: string | null;
        scanFrequency: Website["scanFrequency"];
        scanPriority: Website["scanPriority"];
        monitoredPaths: string[];
        alertProfile: Website["alertProfile"];
        respectRobots?: boolean | null;
        /** Null means "do not schedule" — a MANUAL-frequency site (§7.5). */
        nextScanAt: Date | null;
      },
      actor: { userId: string; ipHash?: string; userAgent?: string },
    ): Promise<Website> {
      return db.$transaction(async (tx) => {
        const created = await tx.website.create({
          data: {
            // Required by the generated input type; `forAgency()` overwrites it
            // anyway. See the note on `clientRepository`.
            agencyId,
            url: input.url,
            originalUrl: input.originalUrl,
            host: input.host,
            registrableDomain: input.registrableDomain,
            clientId: input.clientId ?? null,
            groupId: input.groupId ?? null,
            label: input.label ?? null,
            scanFrequency: input.scanFrequency,
            scanPriority: input.scanPriority,
            monitoredPaths: input.monitoredPaths,
            alertProfile: input.alertProfile,
            respectRobots: input.respectRobots ?? null,
            nextScanAt: input.nextScanAt,
          },
        });

        await audit.record(
          {
            action: "website.created",
            entityType: "Website",
            entityId: created.id,
            userId: actor.userId,
            after: { url: created.url, clientId: created.clientId },
            ipHash: actor.ipHash ?? null,
            userAgent: actor.userAgent ?? null,
          },
          tx,
        );

        await incrementWebsiteUsage(tx);

        return created;
      });
    },

    async update(
      id: string,
      patch: Prisma.WebsiteUpdateInput,
      actor: { userId: string; ipHash?: string; userAgent?: string },
    ): Promise<Website | null> {
      const before = await db.website.findUnique({ where: { id } });
      if (!before) return null;

      return db.$transaction(async (tx) => {
        const updated = await tx.website.update({ where: { id }, data: patch });
        await audit.record(
          {
            action: "website.updated",
            entityType: "Website",
            entityId: id,
            userId: actor.userId,
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
     * Pause / resume monitoring.
     *
     * `nextScanAt` is the SINGLE source of truth for scheduling (§7.5), so
     * pausing nulls it rather than setting a flag the scheduler might not read.
     * Resuming asks the caller for the next due time, because that calculation
     * belongs to the scheduler, not to a repository.
     */
    async setMonitoring(
      id: string,
      status: MonitoringStatus,
      nextScanAt: Date | null,
      actor: { userId: string; ipHash?: string; userAgent?: string },
    ): Promise<Website | null> {
      const before = await db.website.findUnique({ where: { id } });
      if (!before) return null;

      return db.$transaction(async (tx) => {
        const updated = await tx.website.update({
          where: { id },
          data: {
            monitoringStatus: status,
            nextScanAt: status === "ACTIVE" ? nextScanAt : null,
            // A resumed site starts its failure count over; otherwise an old
            // outage keeps it one failure away from auto-erroring again.
            ...(status === "ACTIVE" ? { consecutiveFailures: 0 } : {}),
          },
        });

        await audit.record(
          {
            action: status === "ACTIVE" ? "website.resumed" : "website.paused",
            entityType: "Website",
            entityId: id,
            userId: actor.userId,
            before: { monitoringStatus: before.monitoringStatus },
            after: { monitoringStatus: status },
            ipHash: actor.ipHash ?? null,
            userAgent: actor.userAgent ?? null,
          },
          tx,
        );

        return updated;
      });
    },

    /**
     * Archive — reversible, and the default destructive action for Manager+.
     * Scan history, evidence and reports all survive.
     */
    async archive(
      id: string,
      actor: { userId: string; ipHash?: string; userAgent?: string },
    ): Promise<Website | null> {
      const existing = await db.website.findUnique({ where: { id } });
      if (!existing) return null;
      if (existing.archivedAt) return existing;

      return db.$transaction(async (tx) => {
        const archived = await tx.website.update({
          where: { id },
          data: {
            archivedAt: new Date(),
            monitoringStatus: "PAUSED",
            // Unschedule it, or the scheduler keeps picking up an archived site.
            nextScanAt: null,
          },
        });

        await audit.record(
          {
            action: "website.archived",
            entityType: "Website",
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

    /**
     * Hard delete — Admin+ only, and it destroys monitoring history, which is
     * the product's core asset (§6.2 rationale for withholding it from Manager).
     * The audit row is written BEFORE the delete so it survives the cascade.
     */
    async hardDelete(
      id: string,
      reason: string,
      actor: { userId: string; ipHash?: string; userAgent?: string },
    ): Promise<boolean> {
      const existing = await db.website.findUnique({ where: { id } });
      if (!existing) return false;

      await db.$transaction(async (tx) => {
        await audit.record(
          {
            action: "website.deleted",
            entityType: "Website",
            entityId: id,
            userId: actor.userId,
            before: { url: existing.url, healthScore: existing.healthScore },
            metadata: { reason },
            ipHash: actor.ipHash ?? null,
            userAgent: actor.userAgent ?? null,
          },
          tx,
        );
        await tx.website.delete({ where: { id } });
      });

      return true;
    },

    /** The entitlement check's input — archived sites do not count (§9.2). */
    async countActive(): Promise<number> {
      return db.website.count({ where: { archivedAt: null } });
    },

    /** Assign or clear the client on many sites at once (bulk action). */
    async assignClient(ids: string[], clientId: string | null): Promise<number> {
      const { count } = await db.website.updateMany({
        where: { id: { in: ids } },
        data: { clientId },
      });
      return count;
    },

    async assignGroup(ids: string[], groupId: string | null): Promise<number> {
      const { count } = await db.website.updateMany({
        where: { id: { in: ids } },
        data: { groupId },
      });
      return count;
    },

    /**
     * Finds a group by name, or creates it.
     *
     * ⚠️ THIS IS THE ONLY PLACE GROUPS ARE CREATED, and it is deliberate. §3.5
     * lists "Move to group" as a bulk action and Group as a filter, but the
     * page inventory has no group-management screen — because a group with no
     * websites in it is not a thing anyone wants to create. Typing a new name
     * while moving sites into it is the whole lifecycle.
     *
     * The unique index is `(agencyId, name)`, so a concurrent create loses the
     * race and is resolved by re-reading rather than by failing the batch.
     */
    async findOrCreateGroup(name: string): Promise<{ id: string; name: string }> {
      const existing = await db.websiteGroup.findFirst({ where: { name } });
      if (existing) return { id: existing.id, name: existing.name };

      try {
        const created = await db.websiteGroup.create({ data: { agencyId, name } });
        return { id: created.id, name: created.name };
      } catch (error) {
        if (!isPrismaError(error, PRISMA_UNIQUE_CONFLICT)) throw error;
        const raced = await db.websiteGroup.findFirstOrThrow({ where: { name } });
        return { id: raced.id, name: raced.name };
      }
    },

    /**
     * AGENCY SCAN SETTINGS — §3.11, Phase 4 task 4.9.
     *
     * ⚠️ Read with `findFirst`, not `findUnique`: an agency that has never
     * opened the settings page has no row, and the caller falls back to the
     * schema defaults rather than seeing a null.
     */
    async scanSettings() {
      return db.agencyScanSettings.findFirst();
    },

    async saveScanSettings(input: {
      defaultFrequency: ScanFrequency;
      defaultPageLimit: number;
      defaultPriority: ScanPriority;
      screenshotPolicy: ScreenshotPolicy;
      respectRobots: boolean;
      userAgentSuffix: string | null;
      ignoredDomains: string[];
      evidenceRetentionDays: number | null;
    }) {
      return db.agencyScanSettings.upsert({
        where: { agencyId },
        create: { ...input, agencyId },
        update: input,
      });
    },

    async listGroups() {
      return db.websiteGroup.findMany({
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      });
    },
  };

  /**
   * Usage metering for the WEBSITES metric.
   *
   * Aligned to the Stripe billing period, not the calendar month (§9.2), so the
   * period comes from the subscription. An agency in trial before checkout has
   * no subscription row yet — that is expected, and metering starts when one
   * exists rather than inventing a period we would later have to reconcile.
   */
  async function incrementWebsiteUsage(
    tx: Pick<TenantClient, "subscription" | "usageRecord">,
  ): Promise<void> {
    const subscription = await tx.subscription.findFirst({
      select: { currentPeriodStart: true, currentPeriodEnd: true },
    });
    if (!subscription?.currentPeriodStart || !subscription.currentPeriodEnd) return;

    await tx.usageRecord.upsert({
      // The unique target that makes double-counting impossible under
      // concurrency (§5.3, "CORRECTNESS — the upsert target"). `agencyId` is
      // spelled out because it is part of the compound key, not a filter.
      where: {
        agencyId_periodStart_metric: {
          agencyId,
          periodStart: subscription.currentPeriodStart,
          metric: "WEBSITES",
        },
      },
      create: {
        agencyId,
        periodStart: subscription.currentPeriodStart,
        periodEnd: subscription.currentPeriodEnd,
        metric: "WEBSITES",
        quantity: 1,
      },
      update: { quantity: { increment: 1 } },
    });
  }
}

export type WebsiteRepository = ReturnType<typeof websiteRepository>;
