import { t } from "@pdm/shared/copy";
import { AddClientForm } from "@/components/clients/add-client-form";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requirePermission } from "@/server/auth/context";

/**
 * ADD CLIENT — §3.7, Phase 1 task 1.5.
 *
 * The permission gate runs here as well as inside `createClient()`. A page is
 * rendered independently of its layout, and an action is a public POST endpoint
 * the proxy does not reliably cover (§6.1) — so neither one can stand in for
 * the other.
 */
export default async function NewClientPage() {
  await requirePermission("client:create");

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      <PageHeader title={t("clients.addClient")} />
      <Card className="p-4 sm:p-6">
        <AddClientForm />
      </Card>
    </div>
  );
}
