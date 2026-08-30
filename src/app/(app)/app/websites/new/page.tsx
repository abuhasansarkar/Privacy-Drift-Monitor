import { t } from "@pdm/shared/copy";
import { AddWebsiteWizard } from "@/components/websites/add-website-wizard";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requirePermission } from "@/server/auth/context";

/**
 * ADD WEBSITE — §3.6, Phase 1 task 1.8.
 *
 * `requirePermission("website:create")` runs HERE, not only in the layout: a
 * page is rendered independently of its layout, so the gate has to sit on the
 * page. It will also run again inside the Server Action that finally creates
 * the row — the proxy does not reliably cover actions (§6.1).
 */
export default async function NewWebsitePage() {
  await requirePermission("website:create");

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <PageHeader title={t("addWebsite.title")} />
      <Card className="px-4 sm:px-6">
        <AddWebsiteWizard />
      </Card>
    </div>
  );
}
