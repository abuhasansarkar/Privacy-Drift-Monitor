import { t } from "@pdm/shared/copy";
import { AdminCard, AdminPage, AdminPill, AdminStat, AdminTable } from "@/components/admin/admin-ui";
import { formatDateTime, formatNumber } from "@/lib/format";
import { requireSuperAdmin } from "@/server/admin/context";
import { dependencyHealth, externalServices, workerActivity } from "@/server/admin/health";
import { queueSnapshots } from "@/server/admin/queue";

/**
 * `/admin/system-health` — PLAN.md §3.12, §10.8, §10.11, Phase 6 task 6.6.
 *
 * ⚠️ IT RUNS THE SAME CHECKS AS THE READINESS PROBE, from the same module. Two
 * implementations would eventually disagree, and the disagreement always
 * arrives at the worst moment: the platform says the container is healthy while
 * the page an operator is staring at says Redis is down.
 *
 * ⚠️ "NOT CONFIGURED" IS NOT "DOWN", and the distinction is load-bearing in
 * every environment except production. A local machine with no Stripe key is
 * correctly configured for local work; painting it red trains people to ignore
 * red.
 */
export default async function AdminSystemHealthPage() {
  await requireSuperAdmin();

  const [checks, queues, workers] = await Promise.all([
    dependencyHealth(),
    queueSnapshots(),
    workerActivity(),
  ]);

  return (
    <AdminPage title={t("admin.healthTitle")}>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {checks.map((check) => (
          <AdminStat
            key={check.name}
            label={check.name}
            value={
              !check.configured
                ? t("admin.healthUnconfigured")
                : check.ok
                  ? t("admin.healthOk")
                  : t("admin.healthDown")
            }
            note={check.configured ? `${t("admin.healthLatency")} ${check.ms} ms` : undefined}
            tone={check.configured && !check.ok ? (check.fatal ? "danger" : "warning") : undefined}
          />
        ))}
      </div>

      <AdminCard title={t("admin.healthWorkers")}>
        <p className="border-b border-border px-4 py-2.5 text-small text-muted-foreground">
          {/*
            ⚠️ COMPLETED WORK, NOT A HEARTBEAT. A wedged worker — leaked browser
            context, stuck pool — writes heartbeats forever and finishes nothing.
            See the note in `server/admin/health.ts`.
          */}
          Scans finished in the last hour, per worker. {formatNumber(workers.running)}{" "}
          currently running.
        </p>
        <AdminTable
          columns={[t("admin.scanWorker"), "Completed (1h)", "Last finished"]}
          empty={workers.workers.length === 0}
        >
          {workers.workers.map((worker) => (
            <tr key={worker.workerId}>
              <td className="px-3 py-2 font-mono text-mono">{worker.workerId}</td>
              <td className="px-3 py-2 tabular-nums">
                {formatNumber(worker.completedLastHour)}
              </td>
              <td className="px-3 py-2">
                {worker.lastFinishedAt
                  ? formatDateTime(worker.lastFinishedAt, "UTC")
                  : "—"}
              </td>
            </tr>
          ))}
        </AdminTable>
      </AdminCard>

      <AdminCard title={t("admin.queueTitle")}>
        <AdminTable
          columns={["Queue", t("admin.queueWaiting"), t("admin.queueActive"), t("admin.queueFailed")]}
        >
          {queues.map((queue) => (
            <tr key={queue.name}>
              <td className="px-3 py-2 font-mono text-mono">{queue.name}</td>
              {queue.reachable ? (
                <>
                  <td className="px-3 py-2 tabular-nums">{formatNumber(queue.waiting)}</td>
                  <td className="px-3 py-2 tabular-nums">{formatNumber(queue.active)}</td>
                  <td className="px-3 py-2 tabular-nums">{formatNumber(queue.failed)}</td>
                </>
              ) : (
                <td colSpan={3} className="px-3 py-2">
                  <AdminPill tone="bad">{t("admin.healthDown")}</AdminPill>
                </td>
              )}
            </tr>
          ))}
        </AdminTable>
      </AdminCard>

      <AdminCard title={t("admin.healthExternal")}>
        <AdminTable columns={["Service", "Configuration"]}>
          {externalServices().map((service) => (
            <tr key={service.name}>
              <td className="px-3 py-2">{service.name}</td>
              <td className="px-3 py-2">
                <AdminPill tone={service.configured ? "good" : "neutral"}>
                  {service.configured ? "Configured" : t("admin.healthUnconfigured")}
                </AdminPill>
              </td>
            </tr>
          ))}
        </AdminTable>
      </AdminCard>
    </AdminPage>
  );
}
