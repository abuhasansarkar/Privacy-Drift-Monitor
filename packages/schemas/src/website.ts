import { z } from "zod";
import {
  alertProfile,
  monitoringStatus,
  scanFrequency,
  scanPriority,
} from "./enums";
import { httpUrl, uuid } from "./primitives";

/**
 * WEBSITE CONTRACTS — PLAN.md Part III §3.6, §6.4, feature doc 03-websites.
 *
 * ⚠️ `url` here is validated for SHAPE ONLY. Two further steps happen
 * server-side and neither belongs in a Zod schema:
 *
 *   1. `normalizeWebsiteUrl()` (@pdm/shared) canonicalises it and derives the
 *      registrable domain via the Public Suffix List.
 *   2. `assertSafeUrl()` (@pdm/scanner) is the SSRF boundary and must run
 *      before ANY navigation and on EVERY redirect hop (§10.3).
 *
 * Passing this schema is not permission to fetch anything.
 */

/** A monitored path must be absolute and must not be a full URL. */
const monitoredPath = z
  .string()
  .trim()
  .min(1)
  .max(2048)
  .startsWith("/", "Paths must start with /")
  .refine((p) => !p.includes("://"), "Enter a path, not a full URL");

export const createWebsiteSchema = z.object({
  url: httpUrl,
  clientId: uuid.optional(),
  groupId: uuid.optional(),
  label: z.string().trim().max(120).optional(),
  scanFrequency: scanFrequency.default("WEEKLY"),
  scanPriority: scanPriority.default("NORMAL"),
  /**
   * §12.9 Q4 default: homepage only, with additional paths up to the plan
   * limit. Multi-page multiplies cost linearly for sub-linear detection gain.
   */
  monitoredPaths: z.array(monitoredPath).min(1).max(20).default(["/"]),
  alertProfile: alertProfile.default("DEFAULT"),
  /** null/undefined = inherit the agency's `respectRobots` setting. */
  respectRobots: z.boolean().optional(),
  runInitialScan: z.boolean().default(true),
});

export type CreateWebsiteInput = z.infer<typeof createWebsiteSchema>;

/**
 * `url` is NOT updatable. Changing the monitored address would silently
 * invalidate every drift comparison against the site's own history — the
 * correct action is to add a new website and archive the old one.
 */
export const updateWebsiteSchema = createWebsiteSchema
  .omit({ url: true, runInitialScan: true })
  .extend({
    monitoringStatus: monitoringStatus.optional(),
    /** Per-site consent adapter / selector overrides — the bespoke-CMP escape hatch. */
    consentOverride: z.record(z.string(), z.unknown()).nullable().optional(),
  })
  .partial();

export type UpdateWebsiteInput = z.infer<typeof updateWebsiteSchema>;

export const websiteSortField = z.enum([
  "url",
  "healthScore",
  "lastScanAt",
  "openIssueCount",
  "createdAt",
]);

export const websiteListQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  clientId: uuid.optional(),
  groupId: uuid.optional(),
  status: monitoringStatus.optional(),
  /** Inclusive band filter for the health score, e.g. "everything under 50". */
  minHealthScore: z.coerce.number().int().min(0).max(100).optional(),
  maxHealthScore: z.coerce.number().int().min(0).max(100).optional(),
  includeArchived: z.boolean().default(false),
  sort: websiteSortField.default("url"),
  direction: z.enum(["asc", "desc"]).default("asc"),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(25),
});

export type WebsiteListQuery = z.infer<typeof websiteListQuerySchema>;

/**
 * Result of `POST /api/websites/validate` — the pre-flight the Add Website
 * wizard runs on blur. Every failure mode is a DISTINCT code so the wizard can
 * show the right message (M2: "invalid, private-IP and unreachable URLs are
 * rejected with the correct distinct messages").
 */
export const urlValidationResultSchema = z.object({
  ok: z.boolean(),
  normalizedUrl: z.string().nullable(),
  registrableDomain: z.string().nullable(),
  /** True when we upgraded a typed http:// to https:// to probe. */
  upgradedToHttps: z.boolean(),
  code: z
    .enum([
      "OK",
      "INVALID_URL",
      "UNSUPPORTED_SCHEME",
      "URL_HAS_CREDENTIALS",
      "NO_REGISTRABLE_DOMAIN",
      "URL_NOT_ALLOWED",
      "UNREACHABLE",
      "DUPLICATE",
      "ENTITLEMENT_EXCEEDED",
    ])
    .default("OK"),
  message: z.string().nullable(),
  /** Set when the target redirects to a different registrable domain (§12.9 Q10). */
  redirectsTo: z.string().nullable().default(null),
});

export type UrlValidationResult = z.infer<typeof urlValidationResultSchema>;

export const bulkWebsiteActionSchema = z.object({
  ids: z.array(uuid).min(1).max(200),
  action: z.enum(["pause", "resume", "archive", "scan", "assignClient", "assignGroup"]),
  clientId: uuid.optional(),
  groupId: uuid.optional(),
});

export type BulkWebsiteAction = z.infer<typeof bulkWebsiteActionSchema>;
