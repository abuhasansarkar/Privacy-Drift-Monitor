import "server-only";
import { clerkClient, currentUser } from "@clerk/nextjs/server";
import { unsafeGlobalClient } from "@pdm/database";
import { childLogger } from "@pdm/shared/logger";
import type { AgencyRole } from "@pdm/shared/permissions";

/**
 * CLERK → DATABASE RECONCILIATION — §6.1, feature 01.
 *
 * The webhook at `/api/webhooks/clerk` is the PRIMARY sync path. This module is
 * the backstop for the window where it has not landed, and it is not a
 * development convenience:
 *
 *   - Locally, Clerk cannot reach `localhost`, so no webhook is ever delivered
 *     unless a tunnel is running. Without this, `/app` is a permanent 403.
 *   - In production, webhook delivery is asynchronous and retried. A user who
 *     creates an organization and lands on `/app` a few hundred milliseconds
 *     later would otherwise be told they have no access to the agency they
 *     just made.
 *
 * ⚠️ WHAT MAKES THIS SAFE. We do not trust the session's `orgId` on its own to
 * provision a tenant. We ask Clerk's Backend API whether the membership
 * actually exists and take the ROLE from that answer. If Clerk does not list
 * the membership, nothing is written and the caller's 403 stands. That is the
 * same authority the webhook acts on, asked synchronously instead of received.
 *
 * ⚠️ The database stays authoritative for the five-role matrix (§6.2). Clerk
 * only knows admin/member, so a Clerk role assigns the INITIAL row and never
 * overwrites one — role changes happen on the Team page.
 */

const db = unsafeGlobalClient(
  // Justification (required in review): this provisions the tenancy rows
  // themselves. There is no agency to scope to until it has run.
  "clerk reconciliation creates the Agency and AgencyMember rows",
);

/**
 * Clerk's coarse roles map to the conservative end of our matrix. Promotion is
 * a deliberate act on the Team page, never a side effect of sync.
 *
 * Shared with the webhook handler so the two paths can never disagree about
 * what a Clerk role means.
 */
export function initialRoleFor(clerkRole: string, agencyHasOwner: boolean): AgencyRole {
  if (clerkRole !== "org:admin") return "VIEWER";
  // The first admin of an owner-less agency is its creator.
  return agencyHasOwner ? "ADMIN" : "OWNER";
}

/** `Agency.slug` is required and globally unique; Clerk's slug is neither guaranteed. */
export function fallbackSlug(clerkOrgId: string): string {
  return `agency-${clerkOrgId.replace(/^org_/, "").toLowerCase()}`;
}

/**
 * Ensures the `User`, `Agency` and `AgencyMember` rows exist for the signed-in
 * user's active organization.
 *
 * @returns true when a membership now exists — the caller should re-query.
 *          false when Clerk says there is none, which is a real 403.
 */
export async function reconcileAgencyMembership(
  clerkUserId: string,
  clerkOrgId: string,
): Promise<boolean> {
  const log = childLogger({ userId: clerkUserId });

  try {
    const clerk = await clerkClient();

    // THE AUTHORITY CHECK. Everything below depends on Clerk confirming this
    // membership; a session claim alone is not enough to provision a tenant.
    const { data: memberships } = await clerk.users.getOrganizationMembershipList({
      userId: clerkUserId,
      limit: 100,
    });
    const membership = memberships.find((m) => m.organization.id === clerkOrgId);
    if (!membership) {
      log.warn({ clerkOrgId }, "clerk reports no membership; not provisioning");
      return false;
    }

    const profile = await currentUser();
    const email =
      profile?.emailAddresses.find(
        (address) => address.id === profile.primaryEmailAddressId,
      )?.emailAddress ?? profile?.emailAddresses[0]?.emailAddress;

    if (!email) {
      // The schema requires an email and there is nothing sensible to invent.
      log.error({ clerkOrgId }, "clerk user has no email address; not provisioning");
      return false;
    }

    const organization = membership.organization;

    // Upserts throughout: this races the webhook by design, and both paths must
    // be able to run in either order without producing a duplicate.
    const user = await db.user.upsert({
      where: { clerkUserId },
      create: {
        clerkUserId,
        email,
        firstName: profile?.firstName ?? null,
        lastName: profile?.lastName ?? null,
        avatarUrl: profile?.imageUrl ?? null,
      },
      update: { email },
    });

    const agency = await db.agency.upsert({
      where: { clerkOrgId },
      create: {
        clerkOrgId,
        name: organization.name,
        slug: organization.slug ?? fallbackSlug(clerkOrgId),
      },
      update: { name: organization.name },
    });

    const agencyHasOwner =
      (await db.agencyMember.count({
        where: { agencyId: agency.id, role: "OWNER" },
      })) > 0;

    // Check if an invitation specified a role for this user
    const pendingInvitation = await db.invitation.findFirst({
      where: {
        agencyId: agency.id,
        email: email.toLowerCase(),
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });

    const assignedRole =
      pendingInvitation?.role ?? initialRoleFor(membership.role, agencyHasOwner);

    await db.agencyMember.upsert({
      where: { agencyId_userId: { agencyId: agency.id, userId: user.id } },
      create: {
        agencyId: agency.id,
        userId: user.id,
        role: assignedRole,
      },
      // Never touches `role` — see the header note on where role lives.
      update: { status: "ACTIVE" },
    });

    if (pendingInvitation) {
      await db.invitation.update({
        where: { id: pendingInvitation.id },
        data: { acceptedAt: new Date() },
      });
    }

    log.info({ agencyId: agency.id }, "provisioned agency membership from clerk");
    return true;
  } catch (error) {
    // A failure here must not become a 500 on every page load. The caller
    // raises NOT_A_MEMBER, which is what the user would have seen anyway.
    log.error({ err: error, clerkOrgId }, "clerk reconciliation failed");
    return false;
  }
}
