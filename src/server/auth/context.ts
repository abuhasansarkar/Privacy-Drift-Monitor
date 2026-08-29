import "server-only";
import { auth, currentUser } from "@clerk/nextjs/server";
import { cache } from "react";

/**
 * Server-side identity resolution.
 *
 * This is the ONLY sanctioned way to establish who is making a request.
 * Call it first in every Route Handler and — critically — first in every
 * Server Action, because Next 16's proxy does not reliably cover actions
 * (PLAN.md §6.1).
 *
 * PHASE 0 SCOPE: this resolves the Clerk identity only. The full
 * `AgencyContext` from PLAN.md §6.1 — agencyId, role, entitlements,
 * websiteScope, timezone — needs the `AgencyMember` table, which arrives
 * with `packages/database`. See the TODO below.
 */

export class AuthenticationError extends Error {
  readonly code = "AUTHENTICATION_ERROR";
  readonly httpStatus = 401;
}

export class AuthorizationError extends Error {
  readonly code = "AUTHORIZATION_ERROR";
  readonly httpStatus = 403;
}

export interface UserContext {
  /** Clerk user id (`user_…`). Maps to `User.clerkUserId`. */
  clerkUserId: string;
  /** Active Clerk organization id (`org_…`). Maps to `Agency.clerkOrgId`. */
  clerkOrgId: string | null;
}

/**
 * Cached per request, so calling it repeatedly across a render tree costs
 * one resolution rather than many.
 */
export const getUserContext = cache(async (): Promise<UserContext | null> => {
  const { userId, orgId } = await auth();
  if (!userId) return null;
  return { clerkUserId: userId, clerkOrgId: orgId ?? null };
});

/** Throws if there is no session. Use in protected handlers and actions. */
export async function requireUser(): Promise<UserContext> {
  const ctx = await getUserContext();
  if (!ctx) throw new AuthenticationError("NOT_AUTHENTICATED");
  return ctx;
}

/** Convenience for UI that needs profile fields (name, email, avatar). */
export const getCurrentUser = cache(async () => currentUser());

/*
 * TODO(Phase 1) — replace `requireUser` with the full tenant context once
 * `packages/database` lands:
 *
 *   export async function requireAgencyContext(): Promise<AgencyContext> {
 *     const { clerkUserId, clerkOrgId } = await requireUser();
 *     if (!clerkOrgId) throw new AuthorizationError("NO_AGENCY");
 *
 *     const member = await prisma.agencyMember.findFirst({
 *       where: {
 *         user:   { clerkUserId },
 *         agency: { clerkOrgId },
 *         status: "ACTIVE",
 *       },
 *       include: {
 *         user: true,
 *         agency: { include: { subscription: { include: { plan: true } } } },
 *       },
 *     });
 *
 *     if (!member) throw new AuthorizationError("NOT_A_MEMBER");
 *     if (member.agency.status === "SUSPENDED") {
 *       throw new AuthorizationError("AGENCY_SUSPENDED");
 *     }
 *
 *     return {
 *       userId:       member.userId,
 *       agencyId:     member.agencyId,
 *       role:         member.role,
 *       websiteScope: member.websiteScope,
 *       entitlements: resolveEntitlements(member.agency),
 *       timezone:     member.user.timezone ?? member.agency.timezone,
 *     };
 *   }
 */
