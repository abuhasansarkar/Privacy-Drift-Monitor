import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { createHash } from "node:crypto";
import { unsafeGlobalClient } from "@pdm/database";
import { AuthorizationError } from "@pdm/shared/errors";
import { logger } from "@pdm/shared/logger";
import { requireUser } from "@/server/auth/context";

/**
 * THE ADMIN BOUNDARY — PLAN.md Part III §3.12, Phase 6 task 6.6.
 *
 * §3.12: "Gated by `SUPER_ADMIN`, which is **not** an agency role — it is a
 * platform-level flag on `User` checked in `(admin)/layout.tsx` and **re-checked
 * in every admin route handler**."
 *
 * ⚠️ THE LAYOUT IS NOT A SECURITY BOUNDARY, AND FEATURE DOC 19 CALLS GATING
 * ONLY THERE "a classic hole". Next renders layouts and pages independently, a
 * Server Action POSTs to the route that invoked it, and a route handler is
 * reachable by URL with no layout involved at all. So `requireSuperAdmin()` is
 * called by the layout AND by every page AND by every handler — three times for
 * one request, deduplicated by `cache()` into one query.
 *
 * ⚠️ SUPER_ADMIN IS ORTHOGONAL TO AGENCY ROLE. An Owner of their own agency has
 * no admin access, and a super admin needs no membership anywhere. Conflating
 * the two would make "make someone an admin" a per-tenant operation.
 */

const db = unsafeGlobalClient(
  // Justification (required in review): the admin surface is CROSS-TENANT by
  // definition — that is what it is for. Every read through it is audit-logged
  // by `auditAdminRead`, which is the control that replaces tenant scoping.
  "the admin panel is cross-tenant by definition; every tenant read is audit-logged",
);

export interface AdminContext {
  userId: string;
  clerkUserId: string;
  email: string;
  name: string;
}

/**
 * Resolves the admin context, or throws 403.
 *
 * ⚠️ IT READS THE FLAG FROM THE DATABASE, NEVER FROM A SESSION CLAIM. A Clerk
 * public-metadata claim is carried in a token that was minted before the flag
 * was revoked; the row is the only thing that is true right now. Admin access
 * is the one place where a minute of staleness is not acceptable.
 */
export const requireSuperAdmin = cache(async (): Promise<AdminContext> => {
  const { clerkUserId } = await requireUser();

  const user = await db.user.findUnique({
    where: { clerkUserId },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      isSuperAdmin: true,
    },
  });

  if (!user?.isSuperAdmin) {
    /*
     * ⚠️ THE REFUSAL IS LOGGED AT WARN. An authenticated non-admin probing
     * `/admin` is either a bug in our navigation or a person trying doors, and
     * both are worth seeing. The `reason` never reaches the browser.
     */
    logger.warn(
      { component: "admin", clerkUserId },
      "non-admin attempted to reach the admin surface",
    );
    throw new AuthorizationError("You don't have access to this page.", {
      reason: `NOT_SUPER_ADMIN:${clerkUserId}`,
    });
  }

  return {
    userId: user.id,
    clerkUserId,
    email: user.email,
    name: [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email,
  };
});

/** True/false without throwing — for navigation that hides rather than blocks. */
export async function isSuperAdmin(): Promise<boolean> {
  try {
    await requireSuperAdmin();
    return true;
  } catch {
    return false;
  }
}

/**
 * Records an admin READ of tenant data.
 *
 * ⚠️ **READS, NOT JUST WRITES**, and §3.12 says so explicitly: "Admin access is
 * fully audit-logged, **including reads of tenant data**." This is the sentence
 * that makes support access defensible when a customer asks who looked at their
 * evidence. An audit trail that records only mutations answers "what did you
 * change" and cannot answer "what did you see", which is the question that
 * actually gets asked.
 *
 * ⚠️ IT IS DELIBERATELY NOT AUTOMATIC. A middleware that logged every admin
 * page view would write a row for `/admin/queue` and `/admin/system-health`,
 * neither of which touches tenant data, and would bury the reads that matter in
 * noise. Each call site names the tenant and the entity it opened.
 *
 * ⚠️ IT NEVER THROWS. A failure to write the audit row must not take down the
 * page — but it is logged at error, because a silent gap in this trail is worse
 * than a slow page.
 */
export async function auditAdminRead(
  admin: AdminContext,
  entry: {
    /** The tenant whose data was read. Null for platform-wide aggregates. */
    agencyId: string | null;
    entityType: string;
    entityId: string;
    action?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    const store = await headers();
    await db.auditLog.create({
      data: {
        agencyId: entry.agencyId,
        userId: admin.userId,
        // Distinguishes an admin's read from the agency's own activity, so an
        // agency reading its own audit log can tell the two apart.
        actorType: "admin",
        action: entry.action ?? `admin.read.${entry.entityType}`,
        entityType: entry.entityType,
        entityId: entry.entityId,
        ipHash: hashIp(store.get("x-forwarded-for")),
        userAgent: store.get("user-agent")?.slice(0, 300) ?? null,
        metadata: (entry.metadata ?? {}) as never,
      },
    });
  } catch (error) {
    logger.error(
      { component: "admin", err: error, entityType: entry.entityType },
      "failed to write admin read audit entry",
    );
  }
}

/** Hashed, never raw (§10.6) — the same rule the portal and free scanner follow. */
function hashIp(forwarded: string | null): string | null {
  if (!forwarded) return null;
  const ip = forwarded.split(",")[0]?.trim();
  if (!ip) return null;
  const salt = process.env.FREE_SCAN_IP_SALT ?? process.env.PORTAL_TOKEN_SECRET ?? "";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

/** The cross-tenant client, for admin queries only. Named so review can grep it. */
export function adminDb() {
  return db;
}
