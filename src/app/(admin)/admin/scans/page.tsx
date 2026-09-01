import Link from "next/link";
import { t } from "@pdm/shared/copy";
import { AdminPage, AdminPill, AdminTable } from "@/components/admin/admin-ui";
import { formatDateTime, formatDuration } from "@/lib/format";
import { requireSuperAdmin } from "@/server/admin/context";
import { listScans } from "@/server/admin/queries";

/**
 * `/admin/scans` — PLAN.md §3.12, Phase 6 task 6.6.
 *
 * ⚠️ FILTERED BY STATUS, DEFAULTING TO EVERYTHING, because the two questions an
 * operator brings here are "what is failing" and "what did this one scan do".
 * The worker id is on every row on purpose: a failure that clusters on one
 * worker is an infrastructure problem, and a failure spread evenly is a code
 * problem — and that is the first thing to establish.
 */
const STATUSES = ["COMPLETED", "PARTIAL", "FAILED", "RUNNING", "QUEUED"] as const;

export default async function AdminScansPage({ searchParams }: PageProps<"/admin/scans">) {
  await requireSuperAdmin();
  const params = await searchParams;
  const status = typeof params.status === "string" ? params.status : undefined;
  const scans = await listScans({ status });

  return (
    <AdminPage
      title={t("admin.scansTitle")}
      action={
        <div className="flex flex-wrap gap-1.5">
          <Link
            href="/admin/scans"
            className={`rounded-md px-2 py-1 text-caption ${!status ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            All
          </Link>
          {STATUSES.map((option) => (
            <Link
              key={option}
              href={`/admin/scans?status=${option}`}
              className={`rounded-md px-2 py-1 text-caption ${status === option ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {option}
            </Link>
          ))}
        </div>
      }
    >
      <AdminTable
        columns={[
          "When",
          "Website",
          "Agency",
          t("admin.agencyStatus"),
          t("admin.scanDuration"),
          t("admin.scanWorker"),
          t("admin.scanError"),
        ]}
        empty={scans.length === 0}
      >
        {scans.map((scan) => (
          <tr key={scan.id}>
            <td className="px-3 py-2 whitespace-nowrap">
              {formatDateTime(scan.createdAt, "UTC")}
            </td>
            <td className="px-3 py-2 break-all">
              {scan.website.label ?? scan.website.url}
            </td>
            <td className="px-3 py-2">{scan.agency.name}</td>
            <td className="px-3 py-2">
              <AdminPill
                tone={
                  scan.status === "COMPLETED"
                    ? "good"
                    : scan.status === "PARTIAL"
                      ? "warn"
                      : scan.status === "FAILED"
                        ? "bad"
                        : "neutral"
                }
              >
                {scan.status}
              </AdminPill>
            </td>
            <td className="px-3 py-2 tabular-nums">
              {scan.durationMs ? formatDuration(scan.durationMs / 1000) : "—"}
            </td>
            <td className="px-3 py-2 font-mono text-mono text-muted-foreground">
              {scan.workerId ?? "—"}
            </td>
            <td className="px-3 py-2 font-mono text-mono text-danger">
              {scan.errorCode ?? ""}
            </td>
          </tr>
        ))}
      </AdminTable>
    </AdminPage>
  );
}
