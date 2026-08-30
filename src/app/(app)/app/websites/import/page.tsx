import { t } from "@pdm/shared/copy";
import { PageHeader } from "@/components/ui/page-header";
import { CsvImport } from "@/components/websites/csv-import";
import { requirePermission } from "@/server/auth/context";

/**
 * IMPORT WEBSITES — §3.6, UI_DESIGN_PROMPTS §5.5, Phase 1 task 1.6.
 *
 * The gate runs here and again inside every action the page calls (§6.1).
 */
export default async function ImportWebsitesPage() {
  await requirePermission("website:create");

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
      <PageHeader title={t("import.title")} />
      <CsvImport />
    </div>
  );
}
