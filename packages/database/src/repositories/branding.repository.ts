import type { TenantClient } from "../tenant";

/**
 * BRANDING REPOSITORY — PLAN.md Part VI §6.9.
 *
 * ⚠️ THE ONE RULE THIS FILE EXISTS FOR: **branding is read by an explicit
 * `agencyId`-scoped query, and any cache over it is keyed ONLY by `agencyId`.**
 * A cache keyed by report id, client id or request is how Agency A's logo ends
 * up on Agency B's report — which is a Phase 4 acceptance criterion asserted by
 * a concurrent-render test, not a thing we reason about.
 *
 * The resolver, the entitlement fallback and the cache live in
 * `packages/reports/src/branding.ts`. This file is only the read and the write.
 */

export interface BrandingInput {
  companyName: string | null;
  logoLightUrl: string | null;
  logoDarkUrl: string | null;
  primaryColor: string;
  accentColor: string;
  contactEmail: string | null;
  contactPhone: string | null;
  reportFooterText: string | null;
  customDisclaimer: string | null;
  portalWelcomeText: string | null;
}

export function brandingRepository(db: TenantClient, agencyId: string) {
  return {
    /** Null when the agency has never saved branding — the caller falls back. */
    async find() {
      return db.agencyBranding.findFirst();
    },

    async upsert(input: BrandingInput) {
      return db.agencyBranding.upsert({
        where: { agencyId },
        create: { ...input, agencyId },
        update: input,
      });
    },

    /** The agency fields a branded surface needs alongside the branding row. */
    async agencyProfile() {
      // `agency` is a GLOBAL model, so the tenant extension does not scope it —
      // hence the explicit id. This is exactly the "explicit agencyId-scoped
      // query" §6.9 requires, spelled out rather than inherited.
      return db.agency.findUnique({
        where: { id: agencyId },
        select: { id: true, name: true, slug: true, timezone: true, websiteUrl: true },
      });
    },

    agencyId,
  };
}

export type BrandingRepository = ReturnType<typeof brandingRepository>;
