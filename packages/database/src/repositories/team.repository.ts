import type { AgencyRole } from "@prisma/client";
import type { TenantClient } from "../tenant";

/**
 * TEAM REPOSITORY — PLAN.md Part VI §6.2, Phase 1 task 1.9.
 *
 * ⚠️ CLERK OWNS WHO IS A MEMBER; THIS OWNS WHAT THEY MAY DO. The five-role
 * matrix (§6.2) has no equivalent in Clerk, which knows only admin/member —
 * so role changes are written here and the webhook never overwrites them
 * (see the note in `src/app/api/webhooks/clerk/route.ts`).
 *
 * ⚠️ AN AGENCY MUST ALWAYS HAVE AN OWNER. Demoting or removing the last one
 * would leave nobody able to manage billing or restore access, with no
 * self-service route back. `wouldOrphanAgency` is checked before both.
 */

export function teamRepository(db: TenantClient, agencyId: string) {
  /**
   * True when this change would leave the agency with no OWNER.
   *
   * Checked inside the same transaction as the write, because two admins
   * demoting the last two owners at once would each see one owner remaining.
   */
  // Derived from the EXTENDED client, not `Prisma.TransactionClient`: the
  // tenant extension changes the delegate types, so the plain Prisma type is
  // not assignable to what `$transaction` actually hands us.
  type Tx = Parameters<Parameters<TenantClient["$transaction"]>[0]>[0];

  async function wouldOrphanAgency(tx: Tx, memberId: string): Promise<boolean> {
    const member = await tx.agencyMember.findUnique({ where: { id: memberId } });
    if (!member || member.role !== "OWNER") return false;

    const owners = await tx.agencyMember.count({
      where: { agencyId, role: "OWNER", status: "ACTIVE" },
    });
    return owners <= 1;
  }

  return {
    async list() {
      return db.agencyMember.findMany({
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              avatarUrl: true,
              lastActiveAt: true,
            },
          },
        },
        // Owners first, then by join date: the list reads as a hierarchy,
        // which is how people look for "who can approve this".
        orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
      });
    },

    async pendingInvitations(now: Date = new Date()) {
      return db.invitation.findMany({
        where: { acceptedAt: null, revokedAt: null, expiresAt: { gt: now } },
        orderBy: { createdAt: "desc" },
      });
    },

    async createInvitation(data: {
      email: string;
      role: AgencyRole;
      token: string;
      invitedById: string;
      expiresAt: Date;
    }) {
      const email = data.email.toLowerCase();
      return db.invitation.upsert({
        where: {
          agencyId_email: {
            agencyId,
            email,
          },
        },
        create: {
          agencyId,
          email,
          role: data.role,
          token: data.token,
          invitedById: data.invitedById,
          expiresAt: data.expiresAt,
        },
        update: {
          role: data.role,
          token: data.token,
          invitedById: data.invitedById,
          expiresAt: data.expiresAt,
          revokedAt: null,
          acceptedAt: null,
        },
      });
    },

    async revokeInvitation(invitationId: string) {
      return db.invitation.update({
        where: { id: invitationId },
        data: { revokedAt: new Date() },
      });
    },

    async findPendingInvitation(email: string) {
      return db.invitation.findFirst({
        where: {
          agencyId,
          email: email.toLowerCase(),
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
      });
    },

    async isMember(email: string): Promise<boolean> {
      const count = await db.agencyMember.count({
        where: {
          agencyId,
          status: "ACTIVE",
          user: { email: email.toLowerCase() },
        },
      });
      return count > 0;
    },

    /** @returns null when not found, "last-owner" when the guard refuses. */
    async setRole(
      memberId: string,
      role: AgencyRole,
    ): Promise<"ok" | "last-owner" | null> {
      return db.$transaction(async (tx) => {
        const member = await tx.agencyMember.findUnique({ where: { id: memberId } });
        if (!member) return null;
        if (role !== "OWNER" && (await wouldOrphanAgency(tx, memberId))) {
          return "last-owner";
        }
        await tx.agencyMember.update({ where: { id: memberId }, data: { role } });
        return "ok";
      });
    },

    async setWebsiteScope(
      memberId: string,
      websiteScope: string[],
    ) {
      return db.agencyMember.update({
        where: { id: memberId },
        data: { websiteScope },
      });
    },

    async findPendingInvitationByToken(token: string) {
      return db.invitation.findFirst({
        where: {
          agencyId,
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { gt: new Date() },
          OR: [
            { token },
            { token: { startsWith: `${token}:::` } },
          ],
        },
      });
    },

    async remove(memberId: string): Promise<"ok" | "last-owner" | null> {
      return db.$transaction(async (tx) => {
        const member = await tx.agencyMember.findUnique({ where: { id: memberId } });
        if (!member) return null;
        if (await wouldOrphanAgency(tx, memberId)) return "last-owner";
        await tx.agencyMember.delete({ where: { id: memberId } });
        return "ok";
      });
    },
  };
}

export type TeamRepository = ReturnType<typeof teamRepository>;
