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
  /*
   * ⚠️ AN ACTIVE SUPPORT SESSION RESOLVES TO THE CUSTOMER'S AGENCY (§3.12's
   * impersonation). It is checked FIRST, before the operator's own membership,
   * because the whole point is to see what they see — resolving our own agency
   * and then swapping would leave a window in which a page rendered the wrong
   * tenant's data.
   *
   * The ticket is signed, expires in 30 minutes, re-verifies `SUPER_ADMIN` on
   * every read, and grants READ ONLY — `requirePermission` refuses every
   * mutating permission while it is active. See `server/admin/impersonation.ts`.
   */
  const impersonated = await resolveImpersonatedContext();
  if (impersonated) return impersonated;

  const { clerkUserId, clerkOrgId } = await requireUser();
  let activeOrgId = clerkOrgId;

  if (!activeOrgId) {
    // 1. Check if the user is already an active member of an agency in our database
    const existingMembership = await prisma.agencyMember.findFirst({
      where: {
        user: { clerkUserId },
        status: "ACTIVE",
      },
      include: { agency: true },
    });

    if (existingMembership?.agency.clerkOrgId) {
      activeOrgId = existingMembership.agency.clerkOrgId;
    } else {
      // 2. Check Clerk Backend API: does Clerk list any organization membership for this user?
      try {
        const { clerkClient } = await import("@clerk/nextjs/server");
        const clerk = await clerkClient();
        const { data: memberships } = await clerk.users.getOrganizationMembershipList({
          userId: clerkUserId,
          limit: 10,
        });
        if (memberships.length > 0 && memberships[0]?.organization.id) {
          activeOrgId = memberships[0].organization.id;
        }
      } catch {
        // Clerk API unavailable or network failure
      }
    }
  }

  if (!activeOrgId) {
    throw new NoAgencyError("Set up your agency to continue.", {
      reason: `NO_ACTIVE_ORG:${clerkUserId}`,
    });
  }

  const findMembership = () =>
    prisma.agencyMember.findFirst({
      where: {
        user: { clerkUserId },
        agency: { clerkOrgId: activeOrgId },
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
    const provisioned = await reconcileAgencyMembership(clerkUserId, activeOrgId);
    if (provisioned) member = await findMembership();
  }

  if (!member) {
    throw new NotAMemberError("You don't have access to this agency.", {
      reason: `NO_ACTIVE_MEMBERSHIP:${clerkUserId}@${activeOrgId}`,
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

  /*
   * ⚠️ IMPERSONATION IS READ-ONLY, ENFORCED HERE RATHER THAN BY CONVENTION.
   * §3.12 exists so support can SEE what a customer sees; nothing in it asks
   * for the ability to change their data. Without this gate, every Server
   * Action in the product would run as the customer with no way to tell it was
   * an operator — and the resulting audit row would name the customer.
   *
   * The check is on the permission VERB, not on a list of actions, so a new
   * mutating permission is refused the day it is added rather than the day
   * somebody remembers to add it to a list.
   */
  const { isImpersonating } = await import("@/server/admin/impersonation");
  if (isMutatingPermission(permission) && (await isImpersonating())) {
    throw new AuthorizationError(
      "Support sessions are read-only.",
      { reason: `IMPERSONATION_READ_ONLY:${permission}` },
    );
  }

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

/**
 * Everything that is not a read.
 *
 * ⚠️ AN ALLOWLIST OF READS, NOT A BLOCKLIST OF WRITES. A permission the product
 * gains tomorrow is refused during a support session by default; a blocklist
 * would let it through until somebody noticed.
 */
function isMutatingPermission(permission: Permission): boolean {
  return !permission.endsWith(":read");
}

/**
 * The impersonated context, or null.
 *
 * ⚠️ IMPORTED LAZILY TO BREAK A CYCLE. `admin/impersonation.ts` imports
 * `admin/context.ts`, which imports this module for `requireUser`. A top-level
 * import here closes the loop and, under Node's ESM loader, produces an
 * undefined binding at call time rather than a build error — the same class of
 * failure AGENTS.md records for barrel re-exports.
 */
async function resolveImpersonatedContext(): Promise<AgencyContext | null> {
  const { currentImpersonation } = await import("@/server/admin/impersonation");
  const ticket = await currentImpersonation();
  if (!ticket) return null;

  const agency = await prisma.agency.findUnique({
    where: { id: ticket.agencyId },
    select: { id: true, name: true, timezone: true },
  });
  if (!agency) return null;

  return {
    // The OPERATOR's user id, never the customer's. An audit row written during
    // a support session must name the person who was actually there.
    userId: ticket.adminUserId,
    clerkUserId: "",
    agencyId: agency.id,
    agencyName: agency.name,
    /*
     * ⚠️ OWNER, BECAUSE THE POINT IS TO SEE EVERYTHING THE CUSTOMER SEES — and
     * it is safe only because every mutating permission is refused above. If
     * that gate is ever removed, this line becomes full write access to an
     * arbitrary tenant.
     */
    role: "OWNER",
    websiteScope: [],
    timezone: agency.timezone,
  };
}

/** Non-throwing variant for layouts that need to redirect rather than error. */
export async function tryGetAgencyContext(): Promise<AgencyContext | null> {
  try {
    return await requireAgencyContext();
  } catch {
    return null;
  }
}
