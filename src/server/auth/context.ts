import "server-only";
import { auth, currentUser } from "@clerk/nextjs/server";
import { cache } from "react";
import { prisma } from "@pdm/database";
// Subpaths, not the `@pdm/shared` barrel: the barrel re-exports the logger and
// `url/normalize`, so importing it here would put pino and tldts on the auth
// path of every authenticated request for no reason.
import {
  AgencySuspendedError,
  AuthenticationError,
  AuthorizationError,
  NoAgencyError,
  NotAMemberError,
  NotFoundError,
} from "@pdm/shared/errors";
import {
  can,
  isWebsiteInScope,
  type AgencyRole,
  type Permission,
} from "@pdm/shared/permissions";
import { reconcileAgencyMembership } from "./clerk-sync";

/**
 * TENANT CONTEXT RESOLUTION — PLAN.md Part VI §6.1, Phase 1 task 1.1/1.2.
 *
 * The ONLY sanctioned way to establish who is making a request.
 *
 * ⚠️ Call this FIRST in every Route Handler and — critically — FIRST in every
 * Server Action. Next 16's proxy does not reliably cover Server Actions,
 * because an action POSTs to the route that invoked it. `src/proxy.ts` is a
 * first line of defence, never the only one.
 *
 * ⚠️ Never import the raw `prisma` client in application code. Use
 * `forAgency(ctx.agencyId)` from `@pdm/database/tenant`. The raw client is used
 * here only to resolve the membership itself, which is by definition a lookup
 * that cannot yet be tenant-scoped.
 */

export interface UserContext {
  /** Clerk user id (`user_…`). Maps to `User.clerkUserId`. */
  clerkUserId: string;
  /** Active Clerk organization id (`org_…`). Maps to `Agency.clerkOrgId`. */
  clerkOrgId: string | null;
}

export interface AgencyContext {
  userId: string;
  clerkUserId: string;
  agencyId: string;
  agencyName: string;
  role: AgencyRole;
  /** Empty array means ALL websites, not none (§6.2). */
  websiteScope: string[];
  /** User timezone if set, otherwise the agency's. Drives all display formatting. */
  timezone: string;
}

/** Cached per request: calling it across a render tree costs one resolution. */
export const getUserContext = cache(async (): Promise<UserContext | null> => {
  const { userId, orgId } = await auth();
  if (!userId) return null;
  return { clerkUserId: userId, clerkOrgId: orgId ?? null };
});

/** Throws if there is no session. */
export async function requireUser(): Promise<UserContext> {
  const ctx = await getUserContext();
  if (!ctx) {
    throw new AuthenticationError("Please sign in to continue.", {
      reason: "NOT_AUTHENTICATED",
    });
  }
  return ctx;
}

/** Convenience for UI that needs profile fields (name, email, avatar). */
export const getCurrentUser = cache(async () => currentUser());

/**
 * Resolves the full tenant context, or throws.
 *
 * Distinct failures on purpose — the app shell routes on them (§3.3), and it
 * routes on `error.code`, never on message text:
 *   NO_AGENCY        → /app/onboarding
 *   AGENCY_SUSPENDED → /app/billing?suspended=1
 *   NOT_A_MEMBER     → 403
 */
export const requireAgencyContext = cache(async (): Promise<AgencyContext> => {
  const { clerkUserId, clerkOrgId } = await requireUser();
  if (!clerkOrgId) {
    throw new NoAgencyError("Set up your agency to continue.", {
      reason: `NO_ACTIVE_ORG:${clerkUserId}`,
    });
  }

  const findMembership = () =>
    prisma.agencyMember.findFirst({
      where: {
        user: { clerkUserId },
        agency: { clerkOrgId },
        status: "ACTIVE",
      },
      include: { user: true, agency: true },
    });

  let member = await findMembership();

  if (!member) {
    // The webhook has not landed yet — locally it never will, because Clerk
    // cannot reach localhost. Ask Clerk's Backend API directly whether this
    // membership exists and provision from its answer; a session claim alone
    // is never enough. Returns false if Clerk says there is no membership,
    // and the 403 below then stands.
    const provisioned = await reconcileAgencyMembership(clerkUserId, clerkOrgId);
    if (provisioned) member = await findMembership();
  }

  if (!member) {
    throw new NotAMemberError("You don't have access to this agency.", {
      reason: `NO_ACTIVE_MEMBERSHIP:${clerkUserId}@${clerkOrgId}`,
    });
  }

  // A cancelled agency is also not permitted through — only ACTIVE proceeds, so
  // a future AgencyStatus value fails closed rather than being let in.
  if (member.agency.status !== "ACTIVE") {
    throw new AgencySuspendedError(
      "This agency's account is not active. Check billing to restore access.",
      { reason: `AGENCY_${member.agency.status}` },
    );
  }

  return {
    userId: member.userId,
    clerkUserId,
    agencyId: member.agencyId,
    agencyName: member.agency.name,
    role: member.role as AgencyRole,
    websiteScope: member.websiteScope,
    timezone: member.user.timezone ?? member.agency.timezone,
  };
});

/**
 * Authorization gate. Returns the context so call sites read as:
 *
 *   const ctx = await requirePermission("website:create");
 *   const db = forAgency(ctx.agencyId);
 *
 * ⚠️ This is the REAL check. `<Can>` in the UI only decides what to render.
 */
export async function requirePermission(
  permission: Permission,
): Promise<AgencyContext> {
  const ctx = await requireAgencyContext();
  if (!can(ctx.role, permission)) {
    // The permission name goes to the log, not to the caller — it is our
    // internal vocabulary and it maps out the RBAC matrix for free.
    throw new AuthorizationError(
      "You don't have permission to do that. Ask an agency admin for access.",
      { reason: `MISSING_PERMISSION:${permission}:role=${ctx.role}` },
    );
  }
  return ctx;
}

/**
 * Website-scope gate for members restricted to specific sites (§6.2).
 *
 * Throws NOT_FOUND, never FORBIDDEN. A 403 here would confirm that the id
 * exists somewhere the caller cannot see, which is exactly the cross-tenant
 * disclosure §6.2 forbids. Raising it at the source rather than relying on the
 * API boundary to rewrite the status means a Server Action — which has no such
 * boundary — gets the same answer.
 */
export async function requireWebsiteAccess(
  websiteId: string,
  permission: Permission = "website:read",
): Promise<AgencyContext> {
  const ctx = await requirePermission(permission);
  if (!isWebsiteInScope(ctx.websiteScope, websiteId)) {
    throw new NotFoundError("We couldn't find that website.", {
      reason: `WEBSITE_OUT_OF_SCOPE:${websiteId}:agency=${ctx.agencyId}`,
    });
  }
  return ctx;
}

/** Non-throwing variant for layouts that need to redirect rather than error. */
export async function tryGetAgencyContext(): Promise<AgencyContext | null> {
  try {
    return await requireAgencyContext();
  } catch {
    return null;
  }
}
