import { z } from "zod";
import { email, uuid } from "./primitives";

/**
 * CLIENT PORTAL INPUTS — §6.10.
 *
 * ⚠️ THE REQUEST ENDPOINT TAKES AN EMAIL AND ALWAYS ANSWERS 204 (§6.10). The
 * schema therefore validates shape only — a rejection here that distinguished
 * "unknown address" from "malformed address" would be the user-enumeration
 * oracle the endpoint exists to avoid.
 */

export const requestMagicLinkSchema = z.object({ email });

export const consumeMagicLinkSchema = z.object({
  // base64url of 32 random bytes — 43 characters, no padding.
  token: z.string().trim().min(20).max(200),
});

export const invitePortalUserSchema = z.object({
  clientId: uuid,
  email,
  name: z.string().trim().max(80).nullable().default(null),
});

export const portalUserIdSchema = z.object({ portalUserId: uuid });

/**
 * ⚠️ THE ONLY TWO SETTINGS A PORTAL USER MAY CHANGE (§3.13). Adding a third
 * field here widens the portal's write surface, which §6.10 keeps to exactly
 * one mutation so `SameSite=Lax` plus an origin check is sufficient CSRF cover.
 */
export const portalSettingsSchema = z.object({
  name: z.string().trim().max(80).nullable().default(null),
  notifyReports: z.boolean(),
  notifyCriticalAlerts: z.boolean(),
});

export type InvitePortalUserInput = z.infer<typeof invitePortalUserSchema>;
export type PortalSettingsInput = z.infer<typeof portalSettingsSchema>;
