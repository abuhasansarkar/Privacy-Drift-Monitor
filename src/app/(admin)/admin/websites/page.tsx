import { t } from "@pdm/shared/copy";
import { AdminPage, AdminPill, AdminTable } from "@/components/admin/admin-ui";
import { formatDate, formatNumber } from "@/lib/format";
import { requireSuperAdmin } from "@/server/admin/context";
import { listProblemWebsites } from "@/server/admin/queries";

/**
 * `/admin/websites` — PLAN.md §3.12, Phase 6 task 6.6.
 *
 * ⚠️ IT SHOWS PROBLEM SITES FIRST AND ONLY. §3.12 asks for "all monitored
 * websites across tenants" and then immediately names what the page is for:
 * "find problem sites (consecutive failures, chronic timeouts, bot-challenge
 * sites)". A cross-tenant list of every website is thousands of rows nobody
 * reads, and the ones that matter are the ones about to generate a support
 * ticket. Sorting by consecutive failures puts them at the top by construction.
 */
export default async function AdminWebsitesPage() {
  await requireSuperAdmin();
  const websites = await listProblemWebsites();

  return (
    <AdminPage
      title={t("admin.websitesProblem")}
      subtitle={t("admin.websitesProblemSubtitle")}
    >
      <AdminTable
        columns={[
          "Website",
          "Agency",
          t("admin.websiteFailures"),
          t("admin.agencyStatus"),
          t("admin.websiteLastScan"),
        ]}
        empty={websites.length === 0}
      >
        {websites.map((website) => (
          <tr key={website.id}>
            <td className="px-3 py-2">
              <span className="font-medium">{website.label ?? website.url}</span>
              <span className="block break-all text-caption text-muted-foreground">
                {website.url}
              </span>
            </td>
            <td className="px-3 py-2">{website.agency.name}</td>
            <td className="px-3 py-2 tabular-nums">
              {/*
                ⚠️ THREE IS THE THRESHOLD THE PRODUCT ALREADY USES: §9.5 sends
                `website-unreachable` after three consecutive failures, and §3.2
                auto-blocks a free-scan domain at three. Colouring at the same
                number means this page agrees with the email the customer just
                received.
              */}
              <span className={website.consecutiveFailures >= 3 ? "text-danger" : undefined}>
                {formatNumber(website.consecutiveFailures)}
              </span>
            </td>
            <td className="px-3 py-2">
              <AdminPill
                tone={website.monitoringStatus === "ACTIVE" ? "good" : "warn"}
              >
                {website.monitoringStatus}
              </AdminPill>
            </td>
            <td className="px-3 py-2">
              {website.lastScanAt ? formatDate(website.lastScanAt, "UTC") : "—"}
            </td>
          </tr>
        ))}
      </AdminTable>
    </AdminPage>
  );
}
