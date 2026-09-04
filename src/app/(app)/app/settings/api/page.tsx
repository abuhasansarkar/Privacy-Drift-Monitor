import { requirePermission } from "@/server/auth/context";
import { listApiKeys } from "@/server/services/api-keys";
import { listWebhookEndpoints } from "@/server/services/webhook-service";
import { ApiSettingsView } from "./api-settings-view";

export const metadata = {
  title: "API & Webhooks — Settings",
};

export default async function ApiSettingsPage() {
  const ctx = await requirePermission("settings:read");

  const [apiKeys, webhooks] = await Promise.all([
    listApiKeys(ctx.agencyId),
    listWebhookEndpoints(ctx.agencyId),
  ]);

  return <ApiSettingsView apiKeys={apiKeys} webhooks={webhooks} />;
}
