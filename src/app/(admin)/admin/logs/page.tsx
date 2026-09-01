import Link from "next/link";
import { t } from "@pdm/shared/copy";
import { AdminCard, AdminPage, AdminPill, AdminTable } from "@/components/admin/admin-ui";
import { formatDateTime } from "@/lib/format";
import { requireSuperAdmin } from "@/server/admin/context";
import { listAuditLog, listSystemLog } from "@/server/admin/queries";

/**
 * `/admin/logs` — PLAN.md §3.12, Phase 6 task 6.6.
 *
 * ⚠️ THE AUDIT LOG HERE INCLUDES **OUR OWN** ENTRIES, and that is the point.
 * Every `actorType: "admin"` row was written by `auditAdminRead` when an
 * operator opened a customer's data. An admin log that showed only what
 * customers did would be a surveillance tool with no accountability in the
 * other direction; showing both is what makes support access defensible.
 */
const LEVELS = ["error", "warn", "info"] as const;

export default async function AdminLogsPage({ searchParams }: PageProps<"/admin/logs">) {
  await requireSuperAdmin();
  const params = await searchParams;
  const level = typeof params.level === "string" ? params.level : undefined;

  const [audit, system] = await Promise.all([listAuditLog(), listSystemLog(level)]);

  return (
    <AdminPage title={t("admin.logsTitle")}>
      <AdminCard title={t("admin.logsAudit")}>
        <AdminTable
          columns={[
            t("admin.logsWhen"),
            t("admin.logsActor"),
            t("admin.logsAction"),
            t("admin.logsEntity"),
          ]}
          empty={audit.length === 0}
        >
          {audit.map((entry) => (
            <tr key={entry.id}>
              <td className="px-3 py-2 whitespace-nowrap">
                {formatDateTime(entry.createdAt, "UTC")}
              </td>
              <td className="px-3 py-2">
                <AdminPill tone={entry.actorType === "admin" ? "bad" : "neutral"}>
                  {entry.actorType}
                </AdminPill>
                <span className="ml-1.5 text-caption text-muted-foreground">
                  {entry.user?.email ?? "—"}
                </span>
              </td>
              <td className="px-3 py-2 font-mono text-mono">{entry.action}</td>
              <td className="px-3 py-2 font-mono text-mono text-muted-foreground">
                {entry.entityType}:{entry.entityId.slice(0, 8)}
              </td>
            </tr>
          ))}
        </AdminTable>
      </AdminCard>

      <AdminCard
        title={t("admin.logsSystem")}
        action={
          <div className="flex gap-1.5">
            <Link
              href="/admin/logs"
              className={`rounded-md px-2 py-1 text-caption ${!level ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
            >
              All
            </Link>
            {LEVELS.map((option) => (
              <Link
                key={option}
                href={`/admin/logs?level=${option}`}
                className={`rounded-md px-2 py-1 text-caption ${level === option ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
              >
                {option}
              </Link>
            ))}
          </div>
        }
      >
        <AdminTable
          columns={[
            t("admin.logsWhen"),
            t("admin.logsLevel"),
            t("admin.logsService"),
            t("admin.logsMessage"),
          ]}
          empty={system.length === 0}
        >
          {system.map((entry) => (
            <tr key={entry.id}>
              <td className="px-3 py-2 whitespace-nowrap">
                {formatDateTime(entry.createdAt, "UTC")}
              </td>
              <td className="px-3 py-2">
                <AdminPill
                  tone={
                    entry.level === "error" ? "bad" : entry.level === "warn" ? "warn" : "neutral"
                  }
                >
                  {entry.level}
                </AdminPill>
              </td>
              <td className="px-3 py-2 font-mono text-mono">{entry.service}</td>
              <td className="px-3 py-2">
                {entry.message}
                {entry.context ? (
                  <span className="mt-0.5 block break-words font-mono text-mono text-muted-foreground">
                    {JSON.stringify(entry.context)}
                  </span>
                ) : null}
              </td>
            </tr>
          ))}
        </AdminTable>
      </AdminCard>
    </AdminPage>
  );
}
