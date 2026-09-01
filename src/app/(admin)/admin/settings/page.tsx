import { t } from "@pdm/shared/copy";
import { AdminCard, AdminPage, AdminPill, AdminTable } from "@/components/admin/admin-ui";
import { formatMoney, formatNumber } from "@/lib/format";
import { requireSuperAdmin } from "@/server/admin/context";
import { getPlatformSettings } from "@/server/admin/queries";

/**
 * `/admin/settings` — PLAN.md §3.12, Phase 6 task 6.6.
 *
 * ⚠️ READ-ONLY, AND THAT IS A DECISION RATHER THAN AN OMISSION. §3.12 lists
 * "plan definitions, default entitlements, scanner defaults, AI model mapping"
 * here, and every one of them is DEPLOYED CONFIGURATION. The plan catalogue in
 * particular is a constant that `stripe-provision.ts` also reads: a form that
 * edited it would desynchronise the prices customers are charged from the ones
 * we advertise, and a Stripe Price cannot be edited after creation anyway.
 *
 * Showing an operator exactly what is live, with no save button, answers the
 * question this page is actually opened for — "what is this environment
 * running?" — without pretending a deploy is a form submission.
 *
 * ⚠️ MAINTENANCE MODE AND THE ANNOUNCEMENT BANNER ARE FEATURE FLAGS, not
 * settings, and live on `/admin/feature-flags` where the kill switches are. Two
 * places to turn something off is one place too many.
 */
export default async function AdminSettingsPage() {
  await requireSuperAdmin();
  const settings = getPlatformSettings();

  return (
    <AdminPage title={t("admin.settingsTitle")} subtitle={t("admin.settingsReadOnlyNote")}>
      <AdminCard title={t("admin.settingsPlans")}>
        <AdminTable
          columns={["Plan", "Monthly (USD)", "Websites", "Scans/mo", "AI credits"]}
        >
          {settings.plans.map((plan) => (
            <tr key={plan.key}>
              <td className="px-3 py-2">
                <span className="font-medium">{plan.name}</span>
                <span className="block font-mono text-mono text-muted-foreground">
                  {plan.key}
                </span>
              </td>
              <td className="px-3 py-2 tabular-nums">
                {formatMoney(plan.monthlyUsd, "usd")}
              </td>
              <td className="px-3 py-2 tabular-nums">{formatNumber(plan.websites)}</td>
              <td className="px-3 py-2 tabular-nums">{formatNumber(plan.scans)}</td>
              <td className="px-3 py-2 tabular-nums">{formatNumber(plan.credits)}</td>
            </tr>
          ))}
        </AdminTable>
      </AdminCard>

      <AdminCard title={t("admin.settingsScanner")}>
        <AdminTable columns={["Setting", "Value"]}>
          <Row label="Scanner version" value={settings.scanner.version} />
          <Row label="Scan concurrency" value={settings.scanner.concurrency} />
          <Row
            label="Free-scan concurrency"
            value={settings.scanner.freeScanConcurrency}
          />
          <Row label="Block media" value={String(settings.scanner.blockMedia)} />
          <Row label="Respect robots.txt" value={String(settings.scanner.respectRobots)} />
        </AdminTable>
      </AdminCard>

      <AdminCard title={t("admin.settingsAi")}>
        <AdminTable columns={["Setting", "Value"]}>
          <Row label="Standard tier model" value={settings.ai.standard} />
          <Row label="Advanced tier model" value={settings.ai.advanced} />
          <tr>
            <td className="px-3 py-2">Provider</td>
            <td className="px-3 py-2">
              <AdminPill tone={settings.ai.configured ? "good" : "neutral"}>
                {settings.ai.configured ? "Configured" : t("admin.healthUnconfigured")}
              </AdminPill>
            </td>
          </tr>
        </AdminTable>
      </AdminCard>
    </AdminPage>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <td className="px-3 py-2">{label}</td>
      <td className="px-3 py-2 font-mono text-mono">{value}</td>
    </tr>
  );
}
