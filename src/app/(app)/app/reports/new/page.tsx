import { t } from "@pdm/shared/copy";
import { ReportWizard } from "@/components/reports/report-wizard";
import { PageHeader } from "@/components/ui/page-header";
import { requirePermission } from "@/server/auth/context";
import { getBrandingSettings } from "@/server/queries/branding";
import { getReportWizardOptions } from "@/server/queries/reports";

/**
 * GENERATE A REPORT — §3.11, UI_DESIGN_PROMPTS §5.19.
 *
 * ⚠️ `report:generate` IS CHECKED HERE **AND** IN THE ACTION. This gate stops
 * the page rendering; the action's gate is the one that decides. Next 16's
 * proxy does not reliably cover Server Actions (§6.1).
 */
export default async function NewReportPage() {
  const ctx = await requirePermission("report:generate");
  const [{ clients, websites }, { branding }] = await Promise.all([
    getReportWizardOptions(ctx),
    getBrandingSettings(ctx),
  ]);

  return (
    <div className="flex w-full flex-col gap-5">
      <PageHeader title={t("reports.wizardTitle")} subtitle={t("reports.subtitle")} />
      <ReportWizard
        clients={clients.map((client) => ({ id: client.id, label: client.name }))}
        websites={websites.map((website) => ({
          id: website.id,
          label: website.label ?? website.url,
          clientId: website.clientId,
        }))}
        branding={{
          companyName: branding.companyName,
          primaryColor: branding.primaryColor,
        }}
        defaultName={t("reports.namePlaceholder")}
      />
    </div>
  );
}
