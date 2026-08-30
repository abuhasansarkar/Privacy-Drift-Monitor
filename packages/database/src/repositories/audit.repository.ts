import type { Prisma as PrismaTypes } from "@prisma/client";
import type { TenantClient } from "../tenant";
import { cursorSlice, type CursorPageRequest } from "./types";

/**
 * AUDIT LOG — PLAN.md §5.6, feature doc 01, Phase 1 task 1.11.
 *
 * "Wired into EVERY mutating operation." An audit row is not telemetry; it is
 * how support answers "who paused monitoring on this site three weeks ago", and
 * it is the evidence trail for the actions most likely to be questioned later —
 * ignoring an issue, deleting a website, exporting evidence.
 *
 * ⚠️ **Write it inside the same transaction as the change it records** (§5.6).
 * An audit log written afterwards is a log that goes missing exactly when the
 * mutation half-failed, which is precisely when you need it. Every method here
 * therefore accepts a transaction client.
 */

/** Dot-namespaced and stable — `/admin/logs` filters on these. */
export type AuditAction =
  | "website.created"
  | "website.updated"
  | "website.paused"
  | "website.resumed"
  | "website.archived"
  | "website.deleted"
  | "website.imported"
  | "client.created"
  | "client.updated"
  | "client.archived"
  | "client.portal_enabled"
  | "client.portal_disabled"
  | "issue.status_changed"
  | "issue.assigned"
  | "issue.ignored"
  | "evidence.exported"
  | "report.generated"
  | "report.shared"
  | "report.deleted"
  | "member.invited"
  | "member.role_changed"
  | "member.removed"
  | "agency.updated"
  | "branding.updated"
  | "scan.triggered"
  | "scan.cancelled";

export interface AuditEntry {
  action: AuditAction;
  entityType: string;
  entityId: string;
  /** Null for system-initiated changes (the scheduler, retention sweeps). */
  userId?: string | null;
  actorType?: "user" | "system" | "admin" | "portal_user";
  /**
   * Previous / new values — only the fields that CHANGED, never the whole row
   * (§10.6 minimisation: an audit trail that snapshots every column quietly
   * becomes a second copy of the data you were trying to protect).
   *
   * Typed loosely because call sites build these from partial patches; they are
   * narrowed to Prisma's JSON input at the write below.
   */
  before?: unknown;
  after?: unknown;
  /** Hashed, never raw — §10.6. */
  ipHash?: string | null;
  userAgent?: string | null;
  metadata?: unknown;
}

/** JSON columns reject `undefined`; `Prisma.DbNull` is how you write SQL NULL. */
function toJson(value: unknown): PrismaTypes.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  return value as PrismaTypes.InputJsonValue;
}

/**
 * Anything Prisma-shaped that can run a write — the extended tenant client, or
 * the transaction client it hands to a `$transaction` callback. Extensions
 * apply inside the transaction, so `agencyId` is still injected either way.
 */
type Writable = Pick<TenantClient, "auditLog">;

export function auditRepository(db: TenantClient) {
  return {
    /**
     * Records one action. Pass the transaction client as `tx` whenever the
     * change being recorded is itself transactional — which is almost always.
     */
    async record(entry: AuditEntry, tx: Writable = db): Promise<void> {
      await tx.auditLog.create({
        data: {
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId,
          userId: entry.userId ?? null,
          actorType: entry.actorType ?? "user",
          before: toJson(entry.before),
          after: toJson(entry.after),
          ipHash: entry.ipHash ?? null,
          userAgent: entry.userAgent ?? null,
          metadata: toJson(entry.metadata),
        },
      });
    },

    /**
     * Cursor-paginated, newest first — the audit trail is unbounded and
     * time-ordered, so offset paging would drift as new rows land (§6.3).
     */
    async list(
      params: CursorPageRequest & {
        action?: string;
        entityType?: string;
        entityId?: string;
        userId?: string;
        from?: Date;
        to?: Date;
      },
    ) {
      const { cursor, limit, from, to, ...filters } = params;

      const rows = await db.auditLog.findMany({
        where: {
          ...(filters.action ? { action: filters.action } : {}),
          ...(filters.entityType ? { entityType: filters.entityType } : {}),
          ...(filters.entityId ? { entityId: filters.entityId } : {}),
          ...(filters.userId ? { userId: filters.userId } : {}),
          ...(from || to
            ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
            : {}),
        },
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        // +1 to detect a next page without a second COUNT query.
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });

      return cursorSlice(rows, limit);
    },
  };
}

export type AuditRepository = ReturnType<typeof auditRepository>;
