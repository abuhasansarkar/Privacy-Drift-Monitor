"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { repositoriesFor } from "@pdm/database/repositories";
import { t } from "@pdm/shared/copy";
import { ConflictError, ValidationError } from "@pdm/shared/errors";
import { requirePermission, getCurrentUser } from "@/server/auth/context";
import { emailQueue } from "@/server/services/queues";
import { enqueueEmail } from "@pdm/scanner/queue/queues";
import { actionFromError, actionOk, type ActionResult } from "./result";

/**
 * TEAM ACTIONS — §6.2, Phase 1 task 1.9.
 *
 * ⚠️ AN AGENCY MUST ALWAYS HAVE AN OWNER. The repository refuses the write that
 * would remove the last one; this maps that refusal to a message the user can
 * act on rather than a generic failure. Without the guard an admin can lock the
 * whole agency out of billing with two clicks and no way back.
 */

const roleInput = z.object({
  memberId: z.uuid(),
  // OWNER is assignable — an owner handing over before they leave is the
  // normal case, and forbidding it is what creates the orphan risk.
  role: z.enum(["OWNER", "ADMIN", "MANAGER", "DEVELOPER", "VIEWER"]),
});

export async function setMemberRole(
  raw: z.infer<typeof roleInput>,
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requirePermission("team:role_change");

    const parsed = roleInput.safeParse(raw);
    if (!parsed.success) {
      throw new ValidationError(t("error.validation"), { reason: "SET_ROLE_SCHEMA" });
    }

    const repos = repositoriesFor(ctx.agencyId);
    const outcome = await repos.team.setRole(parsed.data.memberId, parsed.data.role);

    if (outcome === null) {
      throw new ValidationError(t("error.notFound"), {
        reason: `MEMBER_MISSING:${parsed.data.memberId}`,
      });
    }
    if (outcome === "last-owner") {
      throw new ConflictError(t("team.lastOwner"), { reason: "LAST_OWNER_DEMOTION" });
    }

    revalidatePath("/app/team");
    return actionOk({ id: parsed.data.memberId });
  } catch (error) {
    return actionFromError(error, "setMemberRole");
  }
}

const removeInput = z.object({ memberId: z.uuid() });

export async function removeMember(
  raw: z.infer<typeof removeInput>,
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requirePermission("team:remove");

    const parsed = removeInput.safeParse(raw);
    if (!parsed.success) {
      throw new ValidationError(t("error.validation"), { reason: "REMOVE_MEMBER_SCHEMA" });
    }

    const repos = repositoriesFor(ctx.agencyId);
    const outcome = await repos.team.remove(parsed.data.memberId);

    if (outcome === null) {
      throw new ValidationError(t("error.notFound"), {
        reason: `MEMBER_MISSING:${parsed.data.memberId}`,
      });
    }
    if (outcome === "last-owner") {
      throw new ConflictError(t("team.lastOwner"), { reason: "LAST_OWNER_REMOVAL" });
    }

    revalidatePath("/app/team");
    return actionOk({ id: parsed.data.memberId });
  } catch (error) {
    return actionFromError(error, "removeMember");
  }
}

const inviteInput = z.object({
  email: z.string().email(),
  role: z.enum(["ADMIN", "MANAGER", "DEVELOPER", "VIEWER"]),
});

export async function inviteMember(
  raw: z.infer<typeof inviteInput>,
): Promise<ActionResult<{ id: string; inviteUrl: string }>> {
  try {
    const ctx = await requirePermission("team:invite");

    const parsed = inviteInput.safeParse(raw);
    if (!parsed.success) {
      throw new ValidationError(t("error.validation"), { reason: "INVITE_MEMBER_SCHEMA" });
    }

    const email = parsed.data.email.toLowerCase().trim();
    const role = parsed.data.role;
    const repos = repositoriesFor(ctx.agencyId);

    // Check if already an active member
    const alreadyMember = await repos.team.isMember(email);
    if (alreadyMember) {
      throw new ConflictError(t("team.alreadyMember"), { reason: "ALREADY_MEMBER" });
    }

    // Check if there is already an active pending invitation
    const existingInvite = await repos.team.findPendingInvitation(email);
    if (existingInvite) {
      throw new ConflictError(t("team.alreadyInvited"), { reason: "ALREADY_INVITED" });
    }

    // Call Clerk to create an organization invitation if Clerk is configured and agency has a Clerk Org
    let clerkInvitationId: string | null = null;
    let clerkInvitationUrl: string | null = null;
    try {
      const agency = await repos.db.agency.findUnique({
        where: { id: ctx.agencyId },
        select: { clerkOrgId: true },
      });

      if (agency?.clerkOrgId) {
        const { clerkClient } = await import("@clerk/nextjs/server");
        const clerk = await clerkClient();
        const clerkRole = role === "ADMIN" ? "org:admin" : "org:member";
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

        const inv = await clerk.organizations.createOrganizationInvitation({
          organizationId: agency.clerkOrgId,
          emailAddress: email,
          role: clerkRole,
          inviterUserId: ctx.clerkUserId,
          redirectUrl: `${appUrl}/app`,
        });
        clerkInvitationId = inv.id;
        clerkInvitationUrl = inv.url ?? null;
      }
    } catch (clerkErr) {
      console.warn("Clerk invitation notice:", clerkErr);
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const rawToken = clerkInvitationId || crypto.randomUUID();
    const token = clerkInvitationUrl ? `${rawToken}:::${clerkInvitationUrl}` : rawToken;
    const inviteUrl = clerkInvitationUrl || `${appUrl}/signup?invitation=${rawToken}`;
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    const invitation = await repos.team.createInvitation({
      email,
      role,
      token,
      invitedById: ctx.userId,
      expiresAt,
    });

    // Dispatch branded invitation email via application email queue
    try {
      const currentUser = await getCurrentUser();
      const inviterName =
        [currentUser?.firstName, currentUser?.lastName].filter(Boolean).join(" ") ||
        "Your team administrator";

      await enqueueEmail(emailQueue(), {
        agencyId: ctx.agencyId,
        message: {
          template: "invitation",
          data: {
            agencyName: ctx.agencyName ?? "Agency",
            inviterName,
            acceptPath: inviteUrl,
          },
        },
        to: email,
        userId: null,
        alertRuleId: null,
        notificationType: "TEAM_INVITATION",
        entityType: "invitation",
        entityId: invitation.id,
        idempotencyKey: `team-invite:${invitation.id}:${Date.now()}`,
      });
    } catch (emailErr) {
      console.warn("Failed to enqueue invitation email:", emailErr);
    }

    await repos.audit.record({
      action: "member.invited",
      entityType: "member",
      entityId: invitation.id,
      userId: ctx.userId,
      after: { email, role },
    });

    revalidatePath("/app/team");
    return actionOk({ id: invitation.id, inviteUrl });
  } catch (error) {
    return actionFromError(error, "inviteMember");
  }
}

const revokeInviteInput = z.object({ invitationId: z.string().uuid() });

export async function revokeInvitation(
  raw: z.infer<typeof revokeInviteInput>,
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requirePermission("team:invite");

    const parsed = revokeInviteInput.safeParse(raw);
    if (!parsed.success) {
      throw new ValidationError(t("error.validation"), { reason: "REVOKE_INVITE_SCHEMA" });
    }

    const repos = repositoriesFor(ctx.agencyId);
    const invitation = await repos.db.invitation.findUnique({
      where: { id: parsed.data.invitationId },
    });

    if (!invitation) {
      throw new ValidationError(t("error.notFound"), {
        reason: `INVITATION_MISSING:${parsed.data.invitationId}`,
      });
    }

    // Try revoking in Clerk if it was a clerk invitation
    try {
      const agency = await repos.db.agency.findUnique({
        where: { id: ctx.agencyId },
        select: { clerkOrgId: true },
      });
      const clerkInvId = invitation.token.split(":::")[0];
      if (agency?.clerkOrgId && clerkInvId?.startsWith("orginv_")) {
        const { clerkClient } = await import("@clerk/nextjs/server");
        const clerk = await clerkClient();
        await clerk.organizations.revokeOrganizationInvitation({
          organizationId: agency.clerkOrgId,
          invitationId: clerkInvId,
          requestingUserId: ctx.clerkUserId,
        });
      }
    } catch (clerkErr) {
      console.warn("Clerk revoke invitation notice:", clerkErr);
    }

    await repos.team.revokeInvitation(parsed.data.invitationId);

    revalidatePath("/app/team");
    return actionOk({ id: parsed.data.invitationId });
  } catch (error) {
    return actionFromError(error, "revokeInvitation");
  }
}

export async function resendInvitation(
  raw: z.infer<typeof revokeInviteInput>,
): Promise<ActionResult<{ id: string; inviteUrl: string }>> {
  try {
    const ctx = await requirePermission("team:invite");

    const parsed = revokeInviteInput.safeParse(raw);
    if (!parsed.success) {
      throw new ValidationError(t("error.validation"), { reason: "RESEND_INVITE_SCHEMA" });
    }

    const repos = repositoriesFor(ctx.agencyId);
    const invitation = await repos.db.invitation.findUnique({
      where: { id: parsed.data.invitationId },
    });

    if (!invitation || invitation.acceptedAt || invitation.revokedAt) {
      throw new ValidationError(t("error.notFound"), {
        reason: `INVITATION_NOT_ACTIVE:${parsed.data.invitationId}`,
      });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const inviteUrl = invitation.token.includes(":::")
      ? invitation.token.split(":::")[1]!
      : (invitation.token.startsWith("http")
          ? invitation.token
          : `${appUrl}/signup?invitation=${invitation.token}`);

    try {
      const currentUser = await getCurrentUser();
      const inviterName =
        [currentUser?.firstName, currentUser?.lastName].filter(Boolean).join(" ") ||
        "Your team administrator";

      await enqueueEmail(emailQueue(), {
        agencyId: ctx.agencyId,
        message: {
          template: "invitation",
          data: {
            agencyName: ctx.agencyName ?? "Agency",
            inviterName,
            acceptPath: inviteUrl,
          },
        },
        to: invitation.email,
        userId: null,
        alertRuleId: null,
        notificationType: "TEAM_INVITATION",
        entityType: "invitation",
        entityId: invitation.id,
        idempotencyKey: `team-invite-resend:${invitation.id}:${Date.now()}`,
      });
    } catch (emailErr) {
      console.warn("Failed to enqueue invitation email:", emailErr);
    }

    revalidatePath("/app/team");
    return actionOk({ id: invitation.id, inviteUrl });
  } catch (error) {
    return actionFromError(error, "resendInvitation");
  }
}


