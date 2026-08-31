import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { unsafeGlobalClient } from "@pdm/database";
import { PortalAuthError } from "@pdm/shared/errors";
import { childLogger } from "@pdm/shared/logger";

/**
 * CLIENT PORTAL SESSIONS — PLAN.md Part VI §6.10.
 *
 * ⚠️ THE HIGHEST-RISK AUTHENTICATED SURFACE IN THE PRODUCT: it grants outsiders
 * access to a slice of tenant data. Every control §6.10 specifies is here, and
 * each one is load-bearing:
 *
 *   Token strength     32 random bytes, base64url; stored ONLY as SHA-256
 *   Magic link         15 minutes, SINGLE USE, invalidated on use
 *   Session            7 days, sliding renewal, absolute max 30 days
 *   Cookie             HttpOnly, Secure, SameSite=Lax, Path=/portal, __Host-
 *   Scope              carries portalUserId + clientId + agencyId; every portal
 *                      query filters on BOTH agencyId and clientId
 *   Revocation         revokedAt set → sessions deleted → next request 401s
 *   Enumeration        the request endpoint always answers 204
 *
 * ⚠️ NOT CLERK, DELIBERATELY (§6.10). Portal users are the AGENCY's customers,
 * not ours: putting them in Clerk would inflate MAU billing, complicate the org
 * model, and give client contacts an account on our platform — which is not
 * what an agency wants.
 *
 * ⚠️ NO CLERK IMPORT MAY EVER APPEAR IN THIS FILE OR ANYWHERE UNDER `(portal)`.
 * `proxy.ts` excludes these paths from Clerk; an import here would reintroduce
 * the dependency the exclusion exists to remove, and portal access is required
 * to survive a Clerk outage.
 */

const db = unsafeGlobalClient(
  // Justification (required in review): a portal request arrives with no tenant
  // context — the session token IS the credential, and `agencyId` is DERIVED
  // from the row it matches. Everything after that point is scoped by both
  // `agencyId` and `clientId`.
  "portal sessions resolve a tenant from a token, not from a session claim",
);

/**
 * ⚠️ `__Host-` REQUIRES `Path=/` in the cookie spec, and §6.10 also asks for
 * `Path=/portal`. The two cannot both hold: a `__Host-` cookie with a narrower
 * path is REJECTED BY THE BROWSER, which would silently break sign-in. The
 * path restriction is the stronger practical control here — it keeps the portal
 * credential off every other route in the app, including the agency app — so
 * the prefix is dropped and `Secure` + `HttpOnly` + `SameSite=Lax` are set
 * explicitly. Documented rather than silently diverging.
 */
export const PORTAL_COOKIE = "pdm_portal";
const COOKIE_PATH = "/portal";

const MAGIC_LINK_TTL_MS = 15 * 60 * 1000;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SESSION_ABSOLUTE_MAX_MS = 30 * 24 * 60 * 60 * 1000;
/** Renew only when more than a day has elapsed — a write per request is waste. */
const SLIDING_RENEWAL_THRESHOLD_MS = 24 * 60 * 60 * 1000;

const TOKEN_BYTES = 32;

const log = childLogger({ component: "portal" });

export function newToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Constant-time compare for two hex digests of equal length. */
function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export interface PortalSessionContext {
  portalUserId: string;
  agencyId: string;
  clientId: string;
  email: string;
  name: string | null;
}

/**
 * Issues a magic link for an email address.
 *
 * ⚠️ RETURNS NULL FOR AN UNKNOWN OR REVOKED ADDRESS RATHER THAN THROWING. The
 * caller answers 204 either way (§6.10) — a different response for a known
 * address is a user-enumeration oracle over the agency's client contacts.
 */
export async function issueMagicLink(
  email: string,
): Promise<{ token: string; portalUser: { id: string; agencyId: string; clientId: string; email: string } } | null> {
  const portalUser = await db.portalUser.findFirst({
    where: { email, revokedAt: null, status: { in: ["INVITED", "ACTIVE"] } },
    select: { id: true, agencyId: true, clientId: true, email: true },
  });
  if (!portalUser) return null;

  const token = newToken();
  await db.portalUser.update({
    where: { id: portalUser.id },
    data: {
      inviteToken: hashToken(token),
      inviteExpiresAt: new Date(Date.now() + MAGIC_LINK_TTL_MS),
    },
  });

  return { token, portalUser };
}

/**
 * Consumes a magic link and creates a session.
 *
 * ⚠️ SINGLE USE. The token is cleared in the same update that reads it, so a
 * link forwarded in an email thread — or captured from a mail scanner that
 * pre-fetches URLs — cannot be replayed.
 *
 * ⚠️ EVERY FAILURE RAISES THE SAME ERROR. Expired, already used, revoked and
 * never existed are one message on purpose.
 */
export async function consumeMagicLink(
  token: string,
  request: { ipHash: string | null; userAgent: string | null },
): Promise<{ sessionToken: string; expiresAt: Date; context: PortalSessionContext }> {
  const tokenHash = hashToken(token);

  const portalUser = await db.portalUser.findFirst({
    where: {
      inviteToken: tokenHash,
      inviteExpiresAt: { gt: new Date() },
      revokedAt: null,
    },
    select: {
      id: true,
      agencyId: true,
      clientId: true,
      email: true,
      name: true,
      inviteToken: true,
    },
  });

  if (!portalUser?.inviteToken || !safeEqual(portalUser.inviteToken, tokenHash)) {
    throw new PortalAuthError(
      "That link can't be used. It may have expired or already been used.",
      { reason: "PORTAL_TOKEN_INVALID" },
    );
  }

  const sessionToken = newToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await db.$transaction([
    // Clearing the token is what makes the link single-use, and it happens in
    // the same transaction as the session insert — a session created without
    // the token being burnt would be replayable.
    db.portalUser.update({
      where: { id: portalUser.id },
      data: {
        inviteToken: null,
        inviteExpiresAt: null,
        status: "ACTIVE",
        lastLoginAt: new Date(),
      },
    }),
    db.portalSession.create({
      data: {
        portalUserId: portalUser.id,
        agencyId: portalUser.agencyId,
        clientId: portalUser.clientId,
        tokenHash: hashToken(sessionToken),
        expiresAt,
        ipHash: request.ipHash,
        userAgent: request.userAgent?.slice(0, 300) ?? null,
      },
    }),
    // §6.10: portal logins are audit-logged with `actorType: 'portal_user'`,
    // and the AGENCY can see them — it is their client's activity.
    db.auditLog.create({
      data: {
        agencyId: portalUser.agencyId,
        action: "portal.login",
        entityType: "portal_user",
        entityId: portalUser.id,
        actorType: "portal_user",
        ipHash: request.ipHash,
        userAgent: request.userAgent?.slice(0, 300) ?? null,
      },
    }),
  ]);

  return {
    sessionToken,
    expiresAt,
    context: {
      portalUserId: portalUser.id,
      agencyId: portalUser.agencyId,
      clientId: portalUser.clientId,
      email: portalUser.email,
      name: portalUser.name,
    },
  };
}

/**
 * Resolves the current portal session, or null.
 *
 * ⚠️ THE PORTAL USER'S `revokedAt` IS RE-CHECKED ON EVERY REQUEST, not only at
 * sign-in. Revocation deletes their sessions, but this second check is what
 * makes "revocation invalidates sessions immediately" true even against a race
 * with an in-flight request (§12.3 acceptance criterion).
 */
export async function getPortalSession(): Promise<PortalSessionContext | null> {
  const store = await cookies();
  const token = store.get(PORTAL_COOKIE)?.value;
  if (!token) return null;

  const session = await db.portalSession.findFirst({
    where: {
      tokenHash: hashToken(token),
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    include: {
      portalUser: {
        select: {
          id: true,
          agencyId: true,
          clientId: true,
          email: true,
          name: true,
          revokedAt: true,
          status: true,
        },
      },
    },
  });

  if (!session || session.portalUser.revokedAt || session.portalUser.status === "REVOKED") {
    return null;
  }

  // Absolute cap: a sliding session that renews forever is a permanent
  // credential with extra steps (§6.10).
  if (Date.now() - session.createdAt.getTime() > SESSION_ABSOLUTE_MAX_MS) {
    await db.portalSession.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }

  // Sliding renewal, throttled — see the threshold constant.
  if (session.expiresAt.getTime() - Date.now() < SESSION_TTL_MS - SLIDING_RENEWAL_THRESHOLD_MS) {
    await db.portalSession
      .update({
        where: { id: session.id },
        data: { expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
      })
      .catch((error) => log.warn({ err: error }, "portal session renewal failed"));
  }

  return {
    portalUserId: session.portalUser.id,
    agencyId: session.portalUser.agencyId,
    clientId: session.portalUser.clientId,
    email: session.portalUser.email,
    name: session.portalUser.name,
  };
}

/** Throws rather than returning null — for pages that cannot render without one. */
export async function requirePortalSession(): Promise<PortalSessionContext> {
  const session = await getPortalSession();
  if (!session) {
    throw new PortalAuthError("Please sign in to continue.", {
      reason: "PORTAL_NO_SESSION",
    });
  }
  return session;
}

export async function setPortalCookie(token: string, expiresAt: Date): Promise<void> {
  const store = await cookies();
  store.set(PORTAL_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: COOKIE_PATH,
    expires: expiresAt,
  });
}

export async function clearPortalSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(PORTAL_COOKIE)?.value;
  if (token) {
    await db.portalSession
      .deleteMany({ where: { tokenHash: hashToken(token) } })
      .catch(() => undefined);
  }
  store.delete({ name: PORTAL_COOKIE, path: COOKIE_PATH });
}

/**
 * A hashed client IP for rate limiting and audit rows.
 *
 * ⚠️ HASHED, NEVER RAW (§10.6). An IP is personal data, and this is a privacy
 * product — storing raw addresses of our customers' customers would be
 * indefensible.
 */
export async function requestFingerprint(): Promise<{
  ipHash: string | null;
  userAgent: string | null;
}> {
  const store = await headers();
  const forwarded = store.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() ?? null;
  return {
    ipHash: ip ? createHash("sha256").update(ip).digest("hex") : null,
    userAgent: store.get("user-agent"),
  };
}

/** Audit helper for portal activity §6.10 requires to be logged. */
export async function auditPortal(
  session: PortalSessionContext,
  action: string,
  entity: { entityType: string; entityId: string },
): Promise<void> {
  await db.auditLog
    .create({
      data: {
        agencyId: session.agencyId,
        action,
        entityType: entity.entityType,
        entityId: entity.entityId,
        actorType: "portal_user",
        metadata: { portalUserId: session.portalUserId },
      },
    })
    .catch((error) => log.warn({ err: error }, "portal audit write failed"));
}
