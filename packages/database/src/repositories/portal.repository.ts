import type { PortalUserStatus } from "@prisma/client";
import type { TenantClient } from "../tenant";

/**
 * PORTAL USER REPOSITORY — PLAN.md Part VI §6.10.
 *
 * The AGENCY-side half of the portal: inviting, resending, revoking. The
 * portal's own request path does not use this file — it has no agency context
 * to scope with until the session is resolved, so it uses
 * `src/server/portal/session.ts`, which reads by token hash against the global
 * client and derives `agencyId` and `clientId` FROM the session row.
 *
 * ⚠️ REVOCATION MUST INVALIDATE IN-FLIGHT SESSIONS (§6.10, and an acceptance
 * criterion). `revoke` below deletes the session rows in the same transaction
 * as the status change — leaving them to expire would keep a removed contact
 * reading a client's findings for up to seven days.
 *
 * ⚠️ TOKENS ARE STORED HASHED. Nothing here accepts or returns a raw token;
 * the caller hashes before it gets this far.
 */

export function portalRepository(db: TenantClient, agencyId: string) {
  type Tx = Parameters<Parameters<TenantClient["$transaction"]>[0]>[0];

  return {
    async listForClient(clientId: string) {
      return db.portalUser.findMany({
        where: { clientId },
        orderBy: { createdAt: "desc" },
      });
    },

    async listAll() {
      return db.portalUser.findMany({
        include: { client: { select: { id: true, name: true } } },
        orderBy: { createdAt: "desc" },
      });
    },

    async findById(id: string) {
      return db.portalUser.findUnique({ where: { id } });
    },

    async invite(params: {
      clientId: string;
      email: string;
      name: string | null;
      invitedById: string;
      inviteTokenHash: string;
      inviteExpiresAt: Date;
    }) {
      // Upsert on (clientId, email): re-inviting an existing contact should
      // refresh their link, not fail with a conflict the UI has to explain.
      return db.portalUser.upsert({
        where: { clientId_email: { clientId: params.clientId, email: params.email } },
        create: {
          agencyId,
          clientId: params.clientId,
          email: params.email,
          name: params.name,
          invitedById: params.invitedById,
          inviteToken: params.inviteTokenHash,
          inviteExpiresAt: params.inviteExpiresAt,
          status: "INVITED",
        },
        update: {
          name: params.name,
          inviteToken: params.inviteTokenHash,
          inviteExpiresAt: params.inviteExpiresAt,
          // A revoked contact who is re-invited comes back as INVITED, not as
          // a permanently dead row.
          status: "INVITED",
          revokedAt: null,
        },
      });
    },

    async setStatus(id: string, status: PortalUserStatus): Promise<boolean> {
      const result = await db.portalUser.updateMany({ where: { id }, data: { status } });
      return result.count === 1;
    },

    /**
     * Revoke: mark the row, then destroy every session it owns.
     *
     * ⚠️ IN ONE TRANSACTION. A revoke that marked the row and then failed to
     * delete sessions would report success while leaving access live.
     */
    async revoke(id: string, at: Date): Promise<boolean> {
      return db.$transaction(async (tx: Tx) => {
        const result = await tx.portalUser.updateMany({
          where: { id, revokedAt: null },
          data: { status: "REVOKED", revokedAt: at, inviteToken: null, inviteExpiresAt: null },
        });
        if (result.count !== 1) return false;
        await tx.portalSession.deleteMany({ where: { portalUserId: id } });
        return true;
      });
    },

    /** Active sessions per contact, for the agency-side "who is logged in" list. */
    async sessionCounts(now: Date) {
      const rows = await db.portalSession.groupBy({
        by: ["portalUserId"],
        where: { revokedAt: null, expiresAt: { gt: now } },
        _count: { _all: true },
      });
      return new Map(rows.map((row) => [row.portalUserId, row._count._all]));
    },

    agencyId,
  };
}

export type PortalRepository = ReturnType<typeof portalRepository>;
