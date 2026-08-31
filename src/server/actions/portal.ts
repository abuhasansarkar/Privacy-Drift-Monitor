"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { repositoriesFor } from "@pdm/database/repositories";
import { renderMessage } from "@pdm/email";
import { resolveBranding } from "@pdm/reports/branding";
import { enqueueEmail } from "@pdm/scanner/queue/queues";
import { portal as portalSchemas } from "@pdm/schemas";
import { t } from "@pdm/shared/copy";
import { NotFoundError, ValidationError } from "@pdm/shared/errors";
import { requirePermission } from "@/server/auth/context";
import {
  clearPortalSession,
  hashToken,
  newToken,
  requirePortalSession,
} from "@/server/portal/session";
import { emailQueue } from "@/server/services/queues";
import { actionFromError, actionOk, type ActionResult } from "./result";

/**
 * PORTAL ACTIONS — §6.10, §3.13.
 *
 * Two audiences in one file, deliberately separated by their gate:
 *   - AGENCY-side (invite / resend / revoke) → `requirePermission("client:update")`
 *   - PORTAL-side (settings / sign out)      → `requirePortalSession()`
 *
 * ⚠️ NEITHER GATE IS EVER THE OTHER. A portal user must not reach an agency
 * action, and an agency member's Clerk session must not satisfy a portal check.
 */

const INVITE_TTL_MS = 15 * 60 * 1000;

// ── Agency side ──────────────────────────────────────────────────────────────

export async function invitePortalUser(
  raw: z.infer<typeof portalSchemas.invitePortalUserSchema>,
): Promise<ActionResult<{ portalUserId: string }>> {
  try {
    const ctx = await requirePermission("client:update");

    const parsed = portalSchemas.invitePortalUserSchema.safeParse(raw);
    if (!parsed.success) {
      throw new ValidationError(
        parsed.error.issues[0]?.message ?? t("error.validation"),
        { reason: "PORTAL_INVITE_SCHEMA" },
      );
    }

    const repos = repositoriesFor(ctx.agencyId);
    const client = await repos.db.client.findUnique({
      where: { id: parsed.data.clientId },
      select: { id: true, name: true, portalEnabled: true },
    });
    if (!client) {
      throw new NotFoundError(t("error.notFound"), {
        reason: `CLIENT_MISSING:${parsed.data.clientId}`,
      });
    }
    if (!client.portalEnabled) {
      // Inviting into a disabled portal would send a link that lands on a
      // dead page — a worse experience than being told to turn it on.
      throw new ValidationError(t("portalAdmin.portalDisabled"), {
        reason: "PORTAL_DISABLED",
      });
    }

    const token = newToken();
    const portalUser = await repos.portal.invite({
      clientId: client.id,
      email: parsed.data.email,
      name: parsed.data.name,
      invitedById: ctx.userId,
      inviteTokenHash: hashToken(token),
      inviteExpiresAt: new Date(Date.now() + INVITE_TTL_MS),
    });

    // ⚠️ AGENCY-BRANDED (§9.5). The client contact hears from their agency, not
    // from us — that is the whole point of the white-label promise.
    const branding = await resolveBranding(ctx.agencyId);
    const message = {
      template: "portal-invitation" as const,
      data: {
        clientName: client.name,
        siteLabel: client.name,
        magicLinkPath: `/portal/auth?token=${token}`,
      },
    };
    renderMessage(message, branding, { appUrl: "", portalUrl: "" });

    await enqueueEmail(emailQueue(), {
      agencyId: ctx.agencyId,
      message: message as unknown,
      to: parsed.data.email,
      userId: null,
      alertRuleId: null,
      notificationType: null,
      entityType: "portal_user",
      entityId: portalUser.id,
      idempotencyKey: `portal-invite:${portalUser.id}:${Date.now()}`,
    });

    await repos.audit.record({
      action: "client.portal_enabled",
      entityType: "portal_user",
      entityId: portalUser.id,
      userId: ctx.userId,
      after: { email: parsed.data.email },
    });

    revalidatePath(`/app/clients/${client.id}`);
    return actionOk({ portalUserId: portalUser.id });
  } catch (error) {
    return actionFromError(error, "invitePortalUser");
  }
}

/**
 * ⚠️ REVOCATION INVALIDATES SESSIONS IMMEDIATELY (§6.10, and an acceptance
 * criterion). The repository deletes every session row in the same transaction
 * as the status change; `getPortalSession` re-checks `revokedAt` on top of
 * that, so an in-flight request loses access too.
 */
export async function revokePortalUser(
  raw: z.infer<typeof portalSchemas.portalUserIdSchema>,
): Promise<ActionResult<{ portalUserId: string }>> {
  try {
    const ctx = await requirePermission("client:update");

    const parsed = portalSchemas.portalUserIdSchema.safeParse(raw);
    if (!parsed.success) {
      throw new ValidationError(t("error.validation"), { reason: "PORTAL_USER_SCHEMA" });
    }

    const repos = repositoriesFor(ctx.agencyId);
    const portalUser = await repos.portal.findById(parsed.data.portalUserId);
    if (!portalUser) {
      throw new NotFoundError(t("error.notFound"), {
        reason: `PORTAL_USER_MISSING:${parsed.data.portalUserId}`,
      });
    }

    const revoked = await repos.portal.revoke(parsed.data.portalUserId, new Date());
    if (!revoked) {
      throw new NotFoundError(t("error.notFound"), {
        reason: `PORTAL_USER_ALREADY_REVOKED:${parsed.data.portalUserId}`,
      });
    }

    await repos.audit.record({
      action: "client.portal_disabled",
      entityType: "portal_user",
      entityId: parsed.data.portalUserId,
      userId: ctx.userId,
      after: { revoked: true },
    });

    revalidatePath(`/app/clients/${portalUser.clientId}`);
    return actionOk({ portalUserId: parsed.data.portalUserId });
  } catch (error) {
    return actionFromError(error, "revokePortalUser");
  }
}

// ── Portal side ──────────────────────────────────────────────────────────────

export async function updatePortalSettings(
  raw: z.infer<typeof portalSchemas.portalSettingsSchema>,
): Promise<ActionResult<{ ok: true }>> {
  try {
    // ⚠️ THE PORTAL SESSION, NOT A CLERK CONTEXT. A portal user has no agency
    // membership and must never be resolved through `requireAgencyContext`.
    const session = await requirePortalSession();

    const parsed = portalSchemas.portalSettingsSchema.safeParse(raw);
    if (!parsed.success) {
      throw new ValidationError(t("error.validation"), { reason: "PORTAL_SETTINGS_SCHEMA" });
    }

    const repos = repositoriesFor(session.agencyId);
    /*
     * ⚠️ Scoped by the session's own id AND client id. This is the ONLY portal
     * mutation (§6.10), which is what keeps `SameSite=Lax` plus an origin check
     * a sufficient CSRF story — widening it means revisiting that decision.
     */
    await repos.db.portalUser.updateMany({
      where: { id: session.portalUserId, clientId: session.clientId },
      data: {
        name: parsed.data.name,
        notifyReports: parsed.data.notifyReports,
        notifyCriticalAlerts: parsed.data.notifyCriticalAlerts,
      },
    });

    revalidatePath("/portal/settings");
    return actionOk({ ok: true });
  } catch (error) {
    return actionFromError(error, "updatePortalSettings");
  }
}

export async function signOutOfPortal(): Promise<void> {
  await clearPortalSession();
}
