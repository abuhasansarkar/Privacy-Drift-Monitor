import { t } from "@pdm/shared/copy";
import { AdminCard, AdminPage, AdminStat, AdminTable } from "@/components/admin/admin-ui";
import { QueueDepths } from "@/components/admin/queue-depths";
import { formatMoney, formatNumber } from "@/lib/format";
import { requireSuperAdmin } from "@/server/admin/context";
import { getPlatformOverview } from "@/server/admin/queries";

/**
 * `/admin` — PLAN.md §3.12, Phase 6 task 6.6.
 *
 * ⚠️ IT ANSWERS ONE QUESTION: is the platform healthy right now. Everything on
 * it is a number an operator would want before deciding whether to open another
 * page — which is why the queue depths and the failure rate sit beside the
 * commercial figures rather than on a separate screen.
 *
 * ⚠️ `requireSuperAdmin()` AGAIN, EVEN THOUGH THE LAYOUT CALLED IT. Layouts and
 * pages render independently in Next; `cache()` makes the second call free. See
 * `server/admin/context.ts`.
 *
 * ⚠️ NO PER-ROW AUDIT ENTRY. These are platform aggregates over every tenant,
 * not a read of one customer's data — §3.12 audits the latter. Writing a row
 * for every dashboard refresh would bury the reads that matter.
 */
export default async function AdminOverviewPage() {
  await requireSuperAdmin();
  const overview = await getPlatformOverview();

  const failurePercent = Math.round(overview.failureRate * 100);

  return (
    <AdminPage title={t("admin.overviewTitle")}>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <AdminStat
          label={t("admin.statAgencies")}
          value={formatNumber(overview.agenciesTotal)}
          note={
            overview.agenciesByPlan.length > 0
              ? `${t("admin.byPlan")}: ${overview.agenciesByPlan
                  .map((row) => `${row.plan} ${row.count}`)
                  .join(" · ")}`
              : undefined
          }
        />
        <AdminStat
          label={t("admin.statWebsites")}
          value={formatNumber(overview.activeWebsites)}
        />
        <AdminStat
          label={t("admin.statScansToday")}
          value={formatNumber(overview.scansToday.total)}
          note={`${overview.scansToday.succeeded} ${t("admin.succeeded")} · ${overview.scansToday.partial} ${t("admin.partial")} · ${overview.scansToday.failed} ${t("admin.failed")}`}
        />
        <AdminStat
          label={t("admin.statFailureRate")}
          value={`${failurePercent}%`}
          /*
           * ⚠️ THE THRESHOLD IS A JUDGEMENT AND IT IS WRITTEN DOWN HERE, not
           * hidden in a colour. §10.12 budgets a 5% failure rate; above 15% a
           * person should be looking at it now. PARTIAL is excluded from the
           * numerator — see the note in `getPlatformOverview`.
           */
          tone={failurePercent >= 15 ? "danger" : failurePercent >= 5 ? "warning" : undefined}
        />
        <AdminStat
          label={t("admin.statCriticalToday")}
          value={formatNumber(overview.criticalIssuesToday)}
        />
        <AdminStat
          label={t("admin.statAiSpendToday")}
          value={formatMoney(Math.round(overview.aiSpendTodayMicroCents / 10_000), "usd")}
        />
        <AdminStat
          label={t("admin.statAiSpendMtd")}
          value={formatMoney(Math.round(overview.aiSpendMtdMicroCents / 10_000), "usd")}
        />
        <AdminStat
          label={t("admin.statMrr")}
          value={formatMoney(overview.mrrCents, "usd")}
        />
      </div>

      <AdminCard title={t("admin.queueTitle")}>
        <QueueDepths />
      </AdminCard>

      <AdminCard title={t("admin.byPlan")}>
        <AdminTable
          columns={[t("admin.agencyPlan"), t("admin.statAgencies")]}
          empty={overview.agenciesByPlan.length === 0}
        >
          {overview.agenciesByPlan.map((row) => (
            <tr key={row.plan}>
              <td className="px-3 py-2">{row.plan}</td>
              <td className="px-3 py-2 tabular-nums">{formatNumber(row.count)}</td>
            </tr>
          ))}
        </AdminTable>
      </AdminCard>
    </AdminPage>
  );
}
