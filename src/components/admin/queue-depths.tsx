import { t } from "@pdm/shared/copy";
import { AdminPill, AdminTable } from "./admin-ui";
import { formatNumber } from "@/lib/format";
import { queueSnapshots } from "@/server/admin/queue";

/**
 * QUEUE DEPTHS — the operator's first glance (§3.12's `/admin` list).
 *
 * ⚠️ A SERVER COMPONENT THAT READS REDIS DIRECTLY. There is no API route in
 * front of it because there is no client to serve: the numbers are rendered on
 * the server and the page is already behind `requireSuperAdmin()`. Adding a
 * route would create a second, separately-gated way to read queue state.
 *
 * ⚠️ AN UNREACHABLE QUEUE IS SHOWN AS UNREACHABLE, NOT AS ZERO — see the note
 * in `server/admin/queue.ts`. Zeros during a Redis outage is the single most
 * misleading thing this table could print.
 */
export async function QueueDepths() {
  const snapshots = await queueSnapshots();

  return (
    <AdminTable
      columns={[
        // "Queue", not "Queues" — the card above is already titled Queues, and
        // a column header that repeats it reads as a mistake.
        t("admin.queueName"),
        t("admin.queueWaiting"),
        t("admin.queueActive"),
        t("admin.queueFailed"),
        t("admin.queueDelayed"),
        "",
      ]}
    >
      {snapshots.map((snapshot) => (
        <tr key={snapshot.name}>
          <td className="px-3 py-2 font-mono text-mono">{snapshot.name}</td>
          {snapshot.reachable ? (
            <>
              <td className="px-3 py-2 tabular-nums">{formatNumber(snapshot.waiting)}</td>
              <td className="px-3 py-2 tabular-nums">{formatNumber(snapshot.active)}</td>
              <td className="px-3 py-2 tabular-nums">
                {snapshot.failed > 0 ? (
                  <span className="text-danger">{formatNumber(snapshot.failed)}</span>
                ) : (
                  formatNumber(snapshot.failed)
                )}
              </td>
              <td className="px-3 py-2 tabular-nums">{formatNumber(snapshot.delayed)}</td>
              <td className="px-3 py-2">
                {snapshot.paused ? (
                  <AdminPill tone="warn">{t("admin.queuePaused")}</AdminPill>
                ) : null}
              </td>
            </>
          ) : (
            <td colSpan={5} className="px-3 py-2">
              <AdminPill tone="bad">{t("admin.healthDown")}</AdminPill>
            </td>
          )}
        </tr>
      ))}
    </AdminTable>
  );
}
