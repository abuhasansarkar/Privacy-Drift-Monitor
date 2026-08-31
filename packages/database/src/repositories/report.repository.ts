import type { Prisma as PrismaTypes, ReportStatus, ReportType } from "@prisma/client";
import type { TenantClient } from "../tenant";
import { skipTake, toOffsetPage, type OffsetPageRequest } from "./types";

/**
 * REPORT REPOSITORY — PLAN.md Part VI §6.8, Part III §3.11.
 *
 * ⚠️ A FAILED REPORT DOES NOT CONSUME THE ALLOWANCE (§12.3, and the failure
 * copy says so out loud). That is why `markFailed` below exists as its own
 * method and why nothing here decrements a counter: usage is recorded on
 * `markReady`, at the one point we know a document exists.
 *
 * ⚠️ `brandingSnapshot` IS WRITTEN AT GENERATION TIME AND NEVER UPDATED. A
 * re-download two years later must render as it was sent; resolving branding
 * live would silently rewrite documents an agency has already emailed to a
 * client.
 */

export interface ReportCreateInput {
  type: ReportType;
  name: string;
  clientId: string | null;
  websiteId: string | null;
  createdById: string;
  periodStart: Date | null;
  periodEnd: Date | null;
  options: PrismaTypes.InputJsonValue;
  idempotencyKey: string | null;
}

export interface ReportListQuery extends OffsetPageRequest {
  type?: ReportType;
  status?: ReportStatus;
  clientId?: string;
  websiteId?: string;
  search?: string;
}

export function reportRepository(db: TenantClient, agencyId: string) {
  return {
    async create(input: ReportCreateInput) {
      return db.report.create({
        data: {
          agencyId,
          type: input.type,
          name: input.name,
          clientId: input.clientId,
          websiteId: input.websiteId,
          createdById: input.createdById,
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
          options: input.options,
          idempotencyKey: input.idempotencyKey,
          status: "QUEUED",
        },
      });
    },

    async list(query: ReportListQuery) {
      const where: PrismaTypes.ReportWhereInput = {
        deletedAt: null,
        ...(query.type ? { type: query.type } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.clientId ? { clientId: query.clientId } : {}),
        ...(query.websiteId ? { websiteId: query.websiteId } : {}),
        ...(query.search
          ? { name: { contains: query.search, mode: "insensitive" as const } }
          : {}),
      };

      const [items, total] = await Promise.all([
        db.report.findMany({
          where,
          include: {
            client: { select: { id: true, name: true } },
            website: { select: { id: true, url: true } },
            createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
          },
          orderBy: { createdAt: "desc" },
          ...skipTake(query),
        }),
        db.report.count({ where }),
      ]);

      return toOffsetPage(items, total, query);
    },

    async findById(id: string) {
      return db.report.findFirst({
        where: { id, deletedAt: null },
        include: {
          client: { select: { id: true, name: true } },
          website: { select: { id: true, url: true } },
          createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
          shares: {
            where: { revokedAt: null },
            orderBy: { createdAt: "desc" },
          },
        },
      });
    },

    /** Idempotent generation: the same request twice returns the first report. */
    async findByIdempotencyKey(key: string) {
      return db.report.findFirst({ where: { idempotencyKey: key, deletedAt: null } });
    },

    async markGenerating(id: string): Promise<boolean> {
      // Guarded on QUEUED so a retried job cannot restart a report that another
      // worker has already finished — the second attempt matches zero rows.
      const result = await db.report.updateMany({
        where: { id, status: "QUEUED" },
        data: { status: "GENERATING" },
      });
      return result.count === 1;
    },

    async markReady(
      id: string,
      data: {
        s3Key: string;
        sizeBytes: number;
        pageCount: number;
        brandingSnapshot: PrismaTypes.InputJsonValue;
        generatedAt: Date;
      },
    ) {
      await db.report.updateMany({
        where: { id },
        data: { status: "READY", ...data, errorCode: null, errorMessage: null },
      });
    },

    /**
     * ⚠️ Deliberately does NOT touch usage. §12.3: "a failed report does not
     * consume the allowance."
     */
    async markFailed(id: string, errorCode: string, errorMessage: string) {
      await db.report.updateMany({
        where: { id },
        data: { status: "FAILED", errorCode, errorMessage },
      });
    },

    /** Re-queues a FAILED or READY report for regeneration. */
    async requeue(id: string): Promise<boolean> {
      const result = await db.report.updateMany({
        where: { id, deletedAt: null, status: { in: ["FAILED", "READY"] } },
        data: { status: "QUEUED", errorCode: null, errorMessage: null },
      });
      return result.count === 1;
    },

    async recordDownload(id: string, at: Date) {
      await db.report.updateMany({
        where: { id },
        data: { downloadCount: { increment: 1 }, lastDownloadedAt: at },
      });
    },

    /** Soft delete — the S3 object is collected by the retention sweep. */
    async softDelete(id: string, at: Date): Promise<boolean> {
      const result = await db.report.updateMany({
        where: { id, deletedAt: null },
        data: { deletedAt: at },
      });
      return result.count === 1;
    },

    async countInPeriod(from: Date, to: Date): Promise<number> {
      return db.report.count({
        where: { createdAt: { gte: from, lt: to }, status: { in: ["READY", "GENERATING", "QUEUED"] } },
      });
    },

    // ── Share links ────────────────────────────────────────────────────────

    /**
     * ⚠️ The TOKEN HASH is stored, never the token. A share link is a bearer
     * credential for a client-facing document; a database read must not hand
     * someone a working URL.
     */
    async createShare(params: {
      reportId: string;
      tokenHash: string;
      expiresAt: Date;
      createdById: string;
    }) {
      return db.reportShare.create({
        data: {
          agencyId,
          reportId: params.reportId,
          token: params.tokenHash,
          expiresAt: params.expiresAt,
          createdById: params.createdById,
        },
      });
    },

    async revokeShare(id: string, at: Date): Promise<boolean> {
      const result = await db.reportShare.updateMany({
        where: { id, revokedAt: null },
        data: { revokedAt: at },
      });
      return result.count === 1;
    },

    /** Agency id, restated so callers do not have to thread it separately. */
    agencyId,
  };
}

export type ReportRepository = ReturnType<typeof reportRepository>;
