import type { DigestFrequency, NotificationType, Severity } from "@prisma/client";
import type { TenantClient } from "../tenant";
import { cursorSlice, type CursorPageRequest } from "./types";

/**
 * NOTIFICATION REPOSITORY — PLAN.md Part III §3.11, Part VI §6.6.
 *
 * ⚠️ IN-APP NOTIFICATIONS ARE THE PATH THAT MUST NEVER DEPEND ON RESEND.
 * §12.3 requires alerts to keep reaching logged-in users while email is down,
 * so nothing in this file touches the email queue, and the dispatcher writes
 * these rows BEFORE it considers a single address.
 *
 * ⚠️ Cursor-paginated (§6.3). The notification stream is unbounded and
 * time-ordered; offset paging drifts as new rows land while you read page two.
 */

export interface NotificationInput {
  userId: string;
  type: NotificationType;
  severity: Severity;
  title: string;
  body: string;
  linkUrl?: string | null;
  entityType?: string | null;
  entityId?: string | null;
}

export function notificationRepository(db: TenantClient, agencyId: string) {
  return {
    /**
     * Bulk insert for one event fanned out across a team.
     *
     * `createMany` rather than a loop: a critical issue on a 12-seat agency is
     * twelve rows, and twelve round-trips inside the alert path is twelve
     * chances to blow the 60-second acceptance criterion.
     */
    async createMany(inputs: readonly NotificationInput[]): Promise<number> {
      if (inputs.length === 0) return 0;
      const result = await db.notification.createMany({
        data: inputs.map((input) => ({
          agencyId,
          userId: input.userId,
          type: input.type,
          severity: input.severity,
          title: input.title,
          body: input.body,
          linkUrl: input.linkUrl ?? null,
          entityType: input.entityType ?? null,
          entityId: input.entityId ?? null,
        })),
      });
      return result.count;
    },

    async listForUser(
      userId: string,
      params: CursorPageRequest & { unreadOnly?: boolean; type?: NotificationType },
    ) {
      const rows = await db.notification.findMany({
        where: {
          userId,
          ...(params.unreadOnly ? { readAt: null } : {}),
          ...(params.type ? { type: params.type } : {}),
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: params.limit + 1,
        ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
      });
      return cursorSlice(rows, params.limit);
    },

    async unreadCount(userId: string): Promise<number> {
      return db.notification.count({ where: { userId, readAt: null } });
    },

    /** The header bell's popover — §3.11 fixes it at the latest five. */
    async latestForUser(userId: string, take = 5) {
      return db.notification.findMany({
        where: { userId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take,
      });
    },

    /**
     * ⚠️ Scoped by `userId` as well as the tenant predicate. One member marking
     * another member's notification read is a small bug with a confusing
     * symptom — an unread count that moves on its own.
     */
    async markRead(userId: string, ids: readonly string[], now: Date): Promise<number> {
      if (ids.length === 0) return 0;
      const result = await db.notification.updateMany({
        where: { userId, id: { in: [...ids] }, readAt: null },
        data: { readAt: now },
      });
      return result.count;
    },

    async markAllRead(userId: string, now: Date): Promise<number> {
      const result = await db.notification.updateMany({
        where: { userId, readAt: null },
        data: { readAt: now },
      });
      return result.count;
    },

    /**
     * Notifications written in a window, for the digest builder.
     *
     * Reads the same rows the notification centre shows rather than a separate
     * "pending digest" table: the digest is a SUMMARY OF WHAT HAPPENED, and a
     * second store of the same facts is a second thing to get out of sync.
     */
    async listForDigest(params: {
      userIds: readonly string[];
      from: Date;
      to: Date;
      types: readonly NotificationType[];
    }) {
      if (params.userIds.length === 0) return [];
      return db.notification.findMany({
        where: {
          userId: { in: [...params.userIds] },
          createdAt: { gte: params.from, lt: params.to },
          ...(params.types.length > 0 ? { type: { in: [...params.types] } } : {}),
        },
        orderBy: { createdAt: "desc" },
        // A digest is a summary, not an archive. An agency that generated 4,000
        // notifications overnight gets the worst 500 and a "and N more" line,
        // rather than an email nobody can open.
        take: 500,
      });
    },

    // ── Preferences ────────────────────────────────────────────────────────

    async preferencesFor(userId: string) {
      return db.notificationPreference.findMany({ where: { userId } });
    },

    /**
     * Preferences for every ACTIVE member, for the dispatcher.
     *
     * A member with NO row for a type is not opted out — they get the defaults.
     * That is resolved in `@pdm/notifications`, not here, so the absence stays
     * visible to the layer that decides what it means.
     */
    async membersWithPreferences(type: NotificationType) {
      const [members, preferences] = await Promise.all([
        db.agencyMember.findMany({
          where: { status: "ACTIVE" },
          select: {
            userId: true,
            websiteScope: true,
            user: {
              select: { id: true, email: true, emailUndeliverableAt: true },
            },
          },
        }),
        db.notificationPreference.findMany({ where: { type } }),
      ]);

      const byUser = new Map(preferences.map((row) => [row.userId, row]));
      return members.map((member) => ({
        userId: member.userId,
        email: member.user.email,
        emailUndeliverable: member.user.emailUndeliverableAt !== null,
        websiteScope: member.websiteScope,
        preference: byUser.get(member.userId) ?? null,
      }));
    },

    async upsertPreference(params: {
      userId: string;
      type: NotificationType;
      inApp: boolean;
      email: boolean;
      digest: DigestFrequency;
    }) {
      return db.notificationPreference.upsert({
        where: {
          userId_agencyId_type: {
            userId: params.userId,
            agencyId,
            type: params.type,
          },
        },
        create: {
          agencyId,
          userId: params.userId,
          type: params.type,
          inApp: params.inApp,
          email: params.email,
          digest: params.digest,
        },
        update: { inApp: params.inApp, email: params.email, digest: params.digest },
      });
    },
  };
}

export type NotificationRepository = ReturnType<typeof notificationRepository>;
