import Link from "next/link";
import { t } from "@pdm/shared/copy";
import { AdminPage, AdminPill, AdminTable } from "@/components/admin/admin-ui";
import { formatDate, formatNumber } from "@/lib/format";
import { requireSuperAdmin } from "@/server/admin/context";
import { listAgencies } from "@/server/admin/queries";

/**
 * `/admin/agencies` — PLAN.md §3.12, Phase 6 task 6.6.
 *
 * ⚠️ THE LIST IS NOT AUDITED; OPENING ONE IS. §3.12 requires admin reads of
 * TENANT DATA to be logged, and a list of agency names with counts is platform
 * metadata — auditing it would write a row every time anyone loaded the page
 * and make the entries that matter unfindable. The detail page, which shows one
 * customer's members, usage and spend, writes an entry every time.
 */
export default async function AdminAgenciesPage({
  searchParams,
}: PageProps<"/admin/agencies">) {
  await requireSuperAdmin();
  const params = await searchParams;
  const search = typeof params.q === "string" ? params.q : undefined;

  const agencies = await listAgencies({ search });

  return (
    <AdminPage
      title={t("admin.agenciesTitle")}
      action={
        <form className="flex gap-2">
          <input
            name="q"
            defaultValue={search}
            placeholder={t("admin.searchPlaceholder")}
            aria-label={t("admin.searchPlaceholder")}
            className="h-9 rounded-md border border-border bg-background px-2.5 text-small"
          />
        </form>
      }
    >
      <AdminTable
        columns={[
          t("admin.agenciesTitle"),
          t("admin.agencyPlan"),
          t("admin.agencyStatus"),
          t("admin.agencyWebsites"),
          t("admin.agencyMembers"),
          t("admin.agencySignedUp"),
          "",
        ]}
        empty={agencies.length === 0}
      >
        {agencies.map((agency) => (
          <tr key={agency.id}>
            <td className="px-3 py-2">
              <span className="font-medium">{agency.name}</span>
              <span className="block text-caption text-muted-foreground">
                {agency.slug}
              </span>
            </td>
            <td className="px-3 py-2">{agency.subscription?.plan.name ?? "—"}</td>
            <td className="px-3 py-2">
              <AdminPill tone={agency.status === "ACTIVE" ? "good" : "bad"}>
                {agency.status}
              </AdminPill>
            </td>
            <td className="px-3 py-2 tabular-nums">
              {formatNumber(agency._count.websites)}
            </td>
            <td className="px-3 py-2 tabular-nums">
              {formatNumber(agency._count.members)}
            </td>
            <td className="px-3 py-2">{formatDate(agency.createdAt, "UTC")}</td>
            <td className="px-3 py-2 text-right">
              <Link
                href={`/admin/agencies/${agency.id}`}
                className="text-primary underline underline-offset-2"
              >
                {t("admin.viewDetail")}
              </Link>
            </td>
          </tr>
        ))}
      </AdminTable>
    </AdminPage>
  );
}
