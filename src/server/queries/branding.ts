import "server-only";
import { repositoriesFor } from "@pdm/database/repositories";
import { defaultBranding, type Branding } from "@pdm/shared/branding";
import type { AgencyContext } from "@/server/auth/context";

/**
 * BRANDING QUERY — §6.9.
 *
 * ⚠️ THE SETTINGS FORM READS THE STORED ROW, NOT `resolveBranding`. The
 * resolver applies the plan entitlement and returns OUR brand when white-label
 * is off — correct for rendering, wrong for an editor, which would then save
 * our defaults over whatever the agency had configured the moment their plan
 * lapsed and came back.
 */
export async function getBrandingSettings(
  ctx: AgencyContext,
): Promise<{ branding: Branding; hasCustomBranding: boolean }> {
  const repos = repositoriesFor(ctx.agencyId);
  const row = await repos.branding.find();
  const fallback = defaultBranding(ctx.agencyId, ctx.agencyName);

  if (!row) return { branding: fallback, hasCustomBranding: false };

  return {
    hasCustomBranding: true,
    branding: {
      agencyId: ctx.agencyId,
      companyName: row.companyName ?? ctx.agencyName,
      logoLightUrl: row.logoLightUrl,
      logoDarkUrl: row.logoDarkUrl,
      primaryColor: row.primaryColor,
      accentColor: row.accentColor,
      contactEmail: row.contactEmail,
      contactPhone: row.contactPhone,
      reportFooterText: row.reportFooterText,
      customDisclaimer: row.customDisclaimer,
      portalWelcomeText: row.portalWelcomeText,
      isWhiteLabelled: true,
    },
  };
}
