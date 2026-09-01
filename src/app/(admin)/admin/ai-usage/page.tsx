import { t } from "@pdm/shared/copy";
import { AdminCard, AdminPage, AdminStat, AdminTable } from "@/components/admin/admin-ui";
import { formatMoney, formatNumber } from "@/lib/format";
import { requireSuperAdmin } from "@/server/admin/context";
import { getAiUsageBreakdown } from "@/server/admin/queries";

/**
 * `/admin/ai-usage` — PLAN.md §3.12, §8.9, Phase 6 task 6.6.
 *
 * ⚠️ THIS PAGE WAS PHASE 5'S ONE DEFERRED ITEM, and the reason it waited is on
 * this line: an admin page with no admin shell, no `SUPER_ADMIN` gate and no
 * audit logging around it is a cross-tenant read with none of its controls.
 * `AIRequest` has carried everything it needs since Phase 5 — `promptVersion`,
 * `creditsCharged`, `validationErrors`, `feedbackScore`, and the
 * `(feature, promptVersion)` index this page reads through.
 *
 * ⚠️ COST IS OUR SPEND; CREDITS ARE WHAT WE CHARGED. §8.9 keeps them separate
 * because a failed call costs the customer nothing and still costs us money —
 * collapsing them here would make the margin look better than it is, which is
 * the one direction a cost dashboard must never be wrong in.
 */
export default async function AdminAiUsagePage() {
  await requireSuperAdmin();
  const usage = await getAiUsageBreakdown();

  const totalCost = usage.byFeature.reduce(
    (total, row) => total + (row._sum.costMicroCents ?? 0),
    0,
  );
  const totalRequests = usage.byFeature.reduce((total, row) => total + row._count._all, 0);
  const failures = usage.failures
    .filter((row) => row.status !== "SUCCESS")
    .reduce((total, row) => total + row._count._all, 0);

  return (
    <AdminPage title={t("admin.navAiUsage")}>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <AdminStat
          label={t("admin.statAiSpendMtd")}
          value={formatMoney(Math.round(totalCost / 10_000), "usd")}
        />
        <AdminStat label="Requests" value={formatNumber(totalRequests)} />
        <AdminStat
          label="Error rate"
          value={
            totalRequests === 0
              ? "0%"
              : `${Math.round((failures / totalRequests) * 100)}%`
          }
          tone={
            totalRequests > 0 && failures / totalRequests >= 0.1 ? "warning" : undefined
          }
        />
        <AdminStat
          label="Latency p50 / p95"
          value={`${usage.p50 ?? "—"} / ${usage.p95 ?? "—"} ms`}
        />
      </div>

      <AdminCard title="By feature">
        <AdminTable
          columns={["Feature", "Requests", "Tokens", "Cost"]}
          empty={usage.byFeature.length === 0}
        >
          {usage.byFeature.map((row) => (
            <tr key={row.feature}>
              <td className="px-3 py-2">{row.feature}</td>
              <td className="px-3 py-2 tabular-nums">{formatNumber(row._count._all)}</td>
              <td className="px-3 py-2 tabular-nums">
                {formatNumber(row._sum.totalTokens ?? 0)}
              </td>
              <td className="px-3 py-2 tabular-nums">
                {formatMoney(Math.round((row._sum.costMicroCents ?? 0) / 10_000), "usd")}
              </td>
            </tr>
          ))}
        </AdminTable>
      </AdminCard>

      <AdminCard title="By model">
        <AdminTable
          columns={["Model", "Requests", "Cost"]}
          empty={usage.byModel.length === 0}
        >
          {usage.byModel.map((row) => (
            <tr key={row.model}>
              <td className="px-3 py-2 font-mono text-mono">{row.model}</td>
              <td className="px-3 py-2 tabular-nums">{formatNumber(row._count._all)}</td>
              <td className="px-3 py-2 tabular-nums">
                {formatMoney(Math.round((row._sum.costMicroCents ?? 0) / 10_000), "usd")}
              </td>
            </tr>
          ))}
        </AdminTable>
      </AdminCard>

      <AdminCard title="Top spenders">
        <AdminTable
          columns={["Agency", "Cost this month"]}
          empty={usage.topSpenders.length === 0}
        >
          {usage.topSpenders.map((row) => (
            <tr key={row.agencyId}>
              <td className="px-3 py-2">{row.name}</td>
              <td className="px-3 py-2 tabular-nums">
                {formatMoney(Math.round(row.costMicroCents / 10_000), "usd")}
              </td>
            </tr>
          ))}
        </AdminTable>
      </AdminCard>
    </AdminPage>
  );
}
