import { t } from "@pdm/shared/copy";
import { AdminCard, AdminPage, AdminPill, AdminTable } from "@/components/admin/admin-ui";
import {
  DangerousQueueAction,
  JobInspector,
  QueueActionButton,
} from "@/components/admin/queue-board";
import { formatNumber } from "@/lib/format";
import {
  drainQueueAction,
  pauseQueueAction,
  removeJobAction,
  resumeQueueAction,
  retryAllFailedAction,
  retryJobAction,
} from "@/server/admin/actions";
import { requireSuperAdmin } from "@/server/admin/context";
import { listJobs, queueSnapshots } from "@/server/admin/queue";

/**
 * `/admin/queue` — PLAN.md §3.12, Phase 6 task 6.6.
 *
 * ⚠️ THE FAILED JOBS ARE LISTED INLINE, PER QUEUE, because "retry a failed job"
 * is the acceptance criterion and making an operator navigate to find one is
 * how a backlog goes unattended. Only failures are expanded: waiting and active
 * jobs are a count, because reading them individually is never the task.
 *
 * ⚠️ EVERY ACTION IS A SERVER ACTION THAT RE-CHECKS `requireSuperAdmin()`. The
 * layout is not in a Server Action's request path — see `server/admin/actions.ts`.
 */
export default async function AdminQueuePage() {
  await requireSuperAdmin();
  const snapshots = await queueSnapshots();

  const failedByQueue = await Promise.all(
    snapshots.map(async (snapshot) =>
      snapshot.reachable && snapshot.failed > 0
        ? { name: snapshot.name, jobs: await listJobs(snapshot.name, "failed", 25) }
        : { name: snapshot.name, jobs: [] },
    ),
  );

  return (
    <AdminPage title={t("admin.queueTitle")}>
      {snapshots.map((snapshot) => {
        const failed = failedByQueue.find((entry) => entry.name === snapshot.name)?.jobs ?? [];

        return (
          <AdminCard
            key={snapshot.name}
            title={snapshot.name}
            action={
              snapshot.reachable ? (
                <div className="flex flex-wrap items-start gap-2">
                  {snapshot.paused ? (
                    <QueueActionButton
                      queue={snapshot.name}
                      label={t("admin.queueResume")}
                      action={resumeQueueAction}
                    />
                  ) : (
                    <QueueActionButton
                      queue={snapshot.name}
                      label={t("admin.queuePause")}
                      action={pauseQueueAction}
                    />
                  )}
                  {snapshot.failed > 0 ? (
                    <DangerousQueueAction
                      queue={snapshot.name}
                      label={t("admin.queueRetryAll")}
                      warning={t("admin.queueRetryAllWarning")}
                      action={retryAllFailedAction}
                    />
                  ) : null}
                  <DangerousQueueAction
                    queue={snapshot.name}
                    label={t("admin.queueDrain")}
                    warning={t("admin.queueDrainWarning")}
                    action={drainQueueAction}
                  />
                </div>
              ) : (
                <AdminPill tone="bad">{t("admin.healthDown")}</AdminPill>
              )
            }
          >
            <div className="flex flex-wrap gap-4 px-4 py-3 text-small">
              <Count label={t("admin.queueWaiting")} value={snapshot.waiting} />
              <Count label={t("admin.queueActive")} value={snapshot.active} />
              <Count label={t("admin.queueFailed")} value={snapshot.failed} danger />
              <Count label={t("admin.queueDelayed")} value={snapshot.delayed} />
              <Count label={t("admin.queueCompleted")} value={snapshot.completed} />
              {snapshot.paused ? (
                <AdminPill tone="warn">{t("admin.queuePaused")}</AdminPill>
              ) : null}
            </div>

            {failed.length > 0 ? (
              <AdminTable
                columns={[t("admin.queueJobInspector"), "Name", t("admin.queueAttempts"), ""]}
              >
                {failed.map((job) => (
                  <tr key={job.id}>
                    <td className="px-3 py-2 align-top">
                      <JobInspector job={job} />
                    </td>
                    <td className="px-3 py-2 align-top">{job.name}</td>
                    <td className="px-3 py-2 align-top tabular-nums">
                      {job.attemptsMade}
                    </td>
                    <td className="px-3 py-2 align-top text-right">
                      <span className="flex justify-end gap-1.5">
                        <QueueActionButton
                          queue={snapshot.name}
                          jobId={job.id}
                          label={t("admin.queueRetryJob")}
                          action={retryJobAction}
                        />
                        <QueueActionButton
                          queue={snapshot.name}
                          jobId={job.id}
                          label={t("admin.queueRemoveJob")}
                          action={removeJobAction}
                          variant="ghost"
                        />
                      </span>
                    </td>
                  </tr>
                ))}
              </AdminTable>
            ) : null}
          </AdminCard>
        );
      })}
    </AdminPage>
  );
}

function Count({
  label,
  value,
  danger,
}: {
  label: string;
  value: number;
  danger?: boolean;
}) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="text-caption text-muted-foreground">{label}</span>
      <span
        className={`tabular-nums ${danger && value > 0 ? "font-medium text-danger" : ""}`}
      >
        {formatNumber(value)}
      </span>
    </span>
  );
}
