import { notFound } from "next/navigation";
import { t } from "@pdm/shared/copy";
import { AdminCard, AdminPage, AdminPill, AdminStat, AdminTable } from "@/components/admin/admin-ui";
import { AgencyActions } from "@/components/admin/agency-actions";
import {
  extendTrialAction,
  grantCreditsAction,
  reactivateAgencyAction,
  startImpersonationAction,
  suspendAgencyAction,
} from "@/server/admin/actions";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { auditAdminRead, requireSuperAdmin } from "@/server/admin/context";
import { getAgencyDetail } from "@/server/admin/queries";

/**
 * `/admin/agencies/[agencyId]` — PLAN.md §3.12, Phase 6 task 6.6.
 *
 * ⚠️ **THIS READ IS AUDITED**, and it is the page §3.12's "including reads of
 * tenant data" was written for. Everything below belongs to one customer: who
 * works there, how much they use, what they spend. The entry is written before
 * the data is rendered, so a render that throws still leaves the record that
 * somebody opened it.
 *
 * ⚠️ EVERY ACTION §3.12 LISTS REQUIRES A REASON AND WRITES ITS OWN AUDIT ENTRY
 * — against the CUSTOMER's agency, so it appears in their own audit log.
 * Impersonation additionally expires, re-verifies `SUPER_ADMIN` on every read,
 * and is read-only: `requirePermission` refuses every mutating permission while
 * a support session is active.
 */
export default async function AdminAgencyDetailPage({
  params,
}: PageProps<"/admin/agencies/[agencyId]">) {
  const admin = await requireSuperAdmin();
  // `params` is a Promise in Next 16 (AGENTS.md).
  const { agencyId } = await params;

  await auditAdminRead(admin, {
    agencyId,
    entityType: "agency",
    entityId: agencyId,
    action: "admin.read.agency_detail",
  });

  const { agency, usage, aiSpend } = await getAgencyDetail(agencyId);
  if (!agency) notFound();

  return (
    <AdminPage title={agency.name} subtitle={agency.slug}>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <AdminStat label={t("admin.agencyStatus")} value={agency.status} />
        <AdminStat
          label={t("admin.agencyPlan")}
          value={agency.subscription?.plan.name ?? "—"}
          note={agency.subscription?.status ?? undefined}
        />
        <AdminStat
          label={t("admin.agencyWebsites")}
          value={formatNumber(agency._count.websites)}
        />
        <AdminStat
          label={t("admin.statAiSpendMtd")}
          value={formatMoney(
            Math.round((aiSpend._sum.costMicroCents ?? 0) / 10_000),
            "usd",
          )}
          note={`${formatNumber(aiSpend._sum.creditsCharged ?? 0)} credits charged`}
        />
      </div>

      <AdminCard title={t("admin.agencyActions")}>
        <AgencyActions
          agencyId={agency.id}
          status={agency.status}
          actions={{
            suspend: suspendAgencyAction,
            reactivate: reactivateAgencyAction,
            extendTrial: extendTrialAction,
            grantCredits: grantCreditsAction,
            impersonate: startImpersonationAction,
          }}
        />
      </AdminCard>

      <AdminCard title={t("admin.agencyMembers")}>
        <AdminTable
          columns={["Email", "Role", "Status"]}
          empty={agency.members.length === 0}
        >
          {agency.members.map((member) => (
            <tr key={member.id}>
              <td className="px-3 py-2">{member.user.email}</td>
              <td className="px-3 py-2">{member.role}</td>
              <td className="px-3 py-2">
                <AdminPill tone={member.status === "ACTIVE" ? "good" : "neutral"}>
                  {member.status}
                </AdminPill>
              </td>
            </tr>
          ))}
        </AdminTable>
      </AdminCard>

      <AdminCard title={t("admin.agencyUsage")}>
        <AdminTable
          columns={["Period", "Metric", "Quantity"]}
          empty={usage.length === 0}
        >
          {usage.map((record) => (
            <tr key={record.id}>
              <td className="px-3 py-2">{formatDate(record.periodStart, "UTC")}</td>
              <td className="px-3 py-2">{record.metric}</td>
              <td className="px-3 py-2 tabular-nums">{formatNumber(record.quantity)}</td>
            </tr>
          ))}
        </AdminTable>
      </AdminCard>
    </AdminPage>
  );
}
