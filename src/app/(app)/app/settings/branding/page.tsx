import { t } from "@pdm/shared/copy";
import { BrandingForm } from "@/components/branding/branding-form";
import { Card } from "@/components/ui/card";
import { requirePermission } from "@/server/auth/context";
import { getBrandingSettings } from "@/server/queries/branding";

/**
 * BRANDING SETTINGS — §3.11, §6.9, UI_DESIGN_PROMPTS §5.26.
 *
 * ⚠️ `branding:update` IS ADMIN+ (§6.2). Branding is what a client sees; a
 * Viewer changing the logo on every report the agency sends is not a settings
 * change, it is a reputational one.
 */
export default async function BrandingSettingsPage() {
  const ctx = await requirePermission("branding:update");
  const { branding } = await getBrandingSettings(ctx);

  return (
    <div className="flex flex-col gap-5">
      {/*
        ⚠️ The entitlement note is INFORMATIONAL and the form stays editable.
        Billing lands in Phase 6; `resolveBranding` is the single enforcement
        point (§6.9), so gating the editor here would be a second, divergent
        place for the same rule.
      */}
      <Card className="p-4">
        <p className="text-small text-muted-foreground">{t("branding.subtitle")}</p>
      </Card>

      <BrandingForm
        initial={{
          companyName: branding.companyName,
          logoLightUrl: branding.logoLightUrl,
          logoDarkUrl: branding.logoDarkUrl,
          primaryColor: branding.primaryColor,
          accentColor: branding.accentColor,
          contactEmail: branding.contactEmail,
          contactPhone: branding.contactPhone,
          reportFooterText: branding.reportFooterText,
          customDisclaimer: branding.customDisclaimer,
          portalWelcomeText: branding.portalWelcomeText,
        }}
        portalPath="/portal"
      />
    </div>
  );
}
