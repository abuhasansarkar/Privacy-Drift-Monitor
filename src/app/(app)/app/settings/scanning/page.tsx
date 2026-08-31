import { repositoriesFor } from "@pdm/database/repositories";
import { t } from "@pdm/shared/copy";
import { ScanSettingsForm } from "@/components/settings/scan-settings-form";
import { Card } from "@/components/ui/card";
import { requirePermission } from "@/server/auth/context";

/**
 * SETTINGS → SCANNING — §3.11, Phase 4 task 4.9.
 *
 * ⚠️ AN AGENCY WITH NO SAVED ROW SEES THE SCHEMA DEFAULTS, not empty fields.
 * These same defaults are what the scanner already applies, so the form shows
 * what is actually in force rather than implying nothing is configured.
 */
export default async function ScanSettingsPage() {
  const ctx = await requirePermission("settings:read");
  const settings = await repositoriesFor(ctx.agencyId).websites.scanSettings();

  return (
    <div className="flex flex-col gap-5">
      <Card className="p-4">
        <p className="text-small text-muted-foreground">{t("scanSettings.subtitle")}</p>
      </Card>

      <ScanSettingsForm
        initial={{
          // Mirrors the Prisma column defaults — see the note above.
          defaultFrequency: settings?.defaultFrequency ?? "WEEKLY",
          defaultPageLimit: settings?.defaultPageLimit ?? 1,
          defaultPriority: settings?.defaultPriority ?? "NORMAL",
          screenshotPolicy: settings?.screenshotPolicy ?? "ON_CHANGE",
          respectRobots: settings?.respectRobots ?? true,
          userAgentSuffix: settings?.userAgentSuffix ?? null,
          ignoredDomains: settings?.ignoredDomains ?? [],
          evidenceRetentionDays: settings?.evidenceRetentionDays ?? null,
        }}
      />
    </div>
  );
}
