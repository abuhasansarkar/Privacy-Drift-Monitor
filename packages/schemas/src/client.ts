import { z } from "zod";
import { shortText, slug, uuid } from "./primitives";

/**
 * CLIENT CONTRACTS — PLAN.md Part III §3.7, feature doc 02-clients.
 *
 * A client groups websites for reporting, portal access and billing reference.
 * It is the commercial unit an agency resells, not the website.
 *
 * ⚠️ `notes` is INTERNAL ONLY. It must never appear in a portal or report
 * payload. That is enforced by `clientPortalSchema` below stripping unknown
 * keys — enforce it in the serializer, never in a template (feature 02).
 */

export const createClientSchema = z.object({
  name: shortText,
  /** Optional: derived from `name` when omitted. Unique per agency. */
  slug: slug.optional(),
  logoUrl: z.string().url().max(2048).optional(),
  contactName: shortText.optional(),
  contactEmail: z.string().trim().toLowerCase().email().max(254).optional(),
  contactPhone: z.string().trim().max(40).optional(),
  /** Internal only — never rendered to a client. */
  notes: z.string().trim().max(10_000).optional(),
  portalEnabled: z.boolean().default(false),
});

export type CreateClientInput = z.infer<typeof createClientSchema>;

/** Every field optional; `slug` is deliberately NOT updatable once set. */
export const updateClientSchema = createClientSchema
  .omit({ slug: true })
  .partial();

export type UpdateClientInput = z.infer<typeof updateClientSchema>;

export const toggleClientPortalSchema = z.object({
  clientId: uuid,
  enabled: z.boolean(),
});

export type ToggleClientPortalInput = z.infer<typeof toggleClientPortalSchema>;

/** Whitelisted sort keys — no free-form field name reaches Prisma (§6.4). */
export const clientSortField = z.enum([
  "name",
  "createdAt",
  "websiteCount",
  "healthScore",
]);

export const clientListQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  portalEnabled: z.boolean().optional(),
  /** Archived clients are hidden by default; archive is not delete. */
  includeArchived: z.boolean().default(false),
  sort: clientSortField.default("name"),
  direction: z.enum(["asc", "desc"]).default("asc"),
  // Clients use OFFSET pagination: the set is bounded by the plan limit and
  // users expect page numbers here (§6.3).
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(25),
});

export type ClientListQuery = z.infer<typeof clientListQuerySchema>;

/**
 * The client-safe projection. Parsed before anything crosses into the portal or
 * a report, so an accidental `include` cannot leak internal fields — Zod strips
 * what the schema does not name.
 */
export const clientPortalSchema = z.object({
  id: uuid,
  name: z.string(),
  logoUrl: z.string().nullable(),
});

export type ClientPortalView = z.infer<typeof clientPortalSchema>;
