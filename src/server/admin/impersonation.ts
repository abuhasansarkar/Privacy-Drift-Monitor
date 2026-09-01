import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";
import { logger } from "@pdm/shared/logger";
import { auditAdminRead, requireSuperAdmin, type AdminContext } from "./context";

/**
 * IMPERSONATION — PLAN.md §3.12, Phase 6 task 6.6.
 *
 * §3.12: "**impersonate — time-limited, reason-required, heavily
 * audit-logged**". Feature doc 19 repeats all three and adds "prominent banner
 * while active".
 *
 * ⚠️ IT GRANTS **READ-ONLY** SIGHT OF WHAT THE CUSTOMER SEES, AND NOTHING MORE.
 * The obvious implementation — swap the session's agency and let the admin use
 * the app — means every Server Action in the product runs as that customer,
 * with no way for the action to know it was an admin. Support does not need to
 * change a customer's data; it needs to see what they see. So the token is
 * checked by the read path and `isImpersonating()` blocks the write path.
 *
 * ⚠️ THE TICKET IS A SIGNED COOKIE WITH AN EXPIRY IN THE PAYLOAD, not a
 * database row. There is no revocation problem to solve: it lasts thirty
 * minutes, and the operator closing the tab is not what ends it — the clock is.
 * A row would need a sweep to clean up and a query on every request, and would
 * still expire on the same schedule.
 *
 * ⚠️ THE SIGNATURE IS OVER THE WHOLE PAYLOAD INCLUDING THE EXPIRY. Signing only
 * the agency id would let anyone who ever held a ticket keep it forever by
 * editing the timestamp.
 */

const COOKIE = "pdm_impersonation";
/** §3.12: "time-limited". Long enough to reproduce a bug, short enough to lapse. */
export const IMPERSONATION_MINUTES = 30;

export interface ImpersonationTicket {
  agencyId: string;
  adminUserId: string;
  adminEmail: string;
  reason: string;
  expiresAt: number;
}

function secret(): string {
  const value = process.env.PORTAL_TOKEN_SECRET;
  if (!value) {
    /*
     * ⚠️ NO SECRET, NO IMPERSONATION. Falling back to a constant would make the
     * ticket forgeable by anyone who read the source, and the thing it forges
     * is cross-tenant read access. Refusing to issue is the only safe default.
     */
    throw new Error("PORTAL_TOKEN_SECRET is required to issue an impersonation ticket");
  }
  return value;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

function encode(ticket: ImpersonationTicket): string {
  const payload = Buffer.from(JSON.stringify(ticket)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function decode(value: string): ImpersonationTicket | null {
  const [payload, signature] = value.split(".");
  if (!payload || !signature) return null;

  const expected = sign(payload);
  // Constant-time, and length-checked first because `timingSafeEqual` throws on
  // a length mismatch rather than returning false.
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const ticket = JSON.parse(Buffer.from(payload, "base64url").toString()) as
      ImpersonationTicket;
    if (typeof ticket.expiresAt !== "number" || ticket.expiresAt <= Date.now()) return null;
    return ticket;
  } catch {
    return null;
  }
}

/**
 * Starts an impersonation session. Requires a reason and records it.
 *
 * ⚠️ THE AUDIT ENTRY IS WRITTEN AGAINST THE **CUSTOMER'S** AGENCY, so it
 * appears in that agency's own audit log. That is deliberate and it is the
 * whole trust argument: a customer who asks "did anyone from your company look
 * at my account" can see the answer themselves, with the reason we typed.
 */
export async function startImpersonation(
  admin: AdminContext,
  agencyId: string,
  reason: string,
): Promise<void> {
  if (reason.trim().length < 8) {
    throw new Error("an impersonation reason is required");
  }

  const ticket: ImpersonationTicket = {
    agencyId,
    adminUserId: admin.userId,
    adminEmail: admin.email,
    reason: reason.trim().slice(0, 500),
    expiresAt: Date.now() + IMPERSONATION_MINUTES * 60_000,
  };

  const store = await cookies();
  store.set(COOKIE, encode(ticket), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: IMPERSONATION_MINUTES * 60,
  });

  await auditAdminRead(admin, {
    agencyId,
    entityType: "agency",
    entityId: agencyId,
    action: "admin.impersonation.started",
    metadata: { reason: ticket.reason, expiresAt: new Date(ticket.expiresAt).toISOString() },
  });

  logger.warn(
    { component: "admin", admin: admin.email, agencyId, reason: ticket.reason },
    "impersonation started",
  );
}

export async function stopImpersonation(): Promise<void> {
  const store = await cookies();
  const active = await currentImpersonation();
  store.delete(COOKIE);

  if (active) {
    const admin = await requireSuperAdmin();
    await auditAdminRead(admin, {
      agencyId: active.agencyId,
      entityType: "agency",
      entityId: active.agencyId,
      action: "admin.impersonation.ended",
    });
  }
}

/**
 * The active ticket, or null.
 *
 * ⚠️ IT RE-CHECKS `SUPER_ADMIN` EVERY TIME. A ticket is a cookie; the flag is
 * the authority. An admin whose access is revoked mid-session must lose the
 * impersonation with it, and checking the signature alone would leave them
 * inside a customer's account for up to thirty more minutes.
 */
export const currentImpersonation = cache(
  async (): Promise<ImpersonationTicket | null> => {
    const store = await cookies();
    const raw = store.get(COOKIE)?.value;
    if (!raw) return null;

    const ticket = decode(raw);
    if (!ticket) return null;

    try {
      const admin = await requireSuperAdmin();
      // The ticket must belong to the person holding it — a cookie copied
      // between operators is not a second grant.
      if (admin.userId !== ticket.adminUserId) return null;
    } catch {
      return null;
    }

    return ticket;
  },
);

/** True while a support session is active. The write path refuses. */
export async function isImpersonating(): Promise<boolean> {
  return (await currentImpersonation()) !== null;
}
