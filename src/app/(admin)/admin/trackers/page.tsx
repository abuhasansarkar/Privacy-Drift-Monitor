import { t } from "@pdm/shared/copy";
import { AdminCard, AdminPage, AdminPill, AdminTable } from "@/components/admin/admin-ui";
import { VendorForm } from "@/components/admin/vendor-form";
import { formatNumber } from "@/lib/format";
import { createTrackerVendorAction } from "@/server/admin/actions";
import { requireSuperAdmin } from "@/server/admin/context";
import { getUnknownDomains, listTrackerVendors } from "@/server/admin/queries";

/**
 * `/admin/trackers` — PLAN.md §3.12, Phase 6 task 6.6.
 *
 * ⚠️ THE UNKNOWN-DOMAIN QUEUE IS THE HALF THAT PAYS FOR ITSELF. Every row is a
 * third party we detected and could not name, multiplied by how many tenants
 * saw it. Naming the top one improves every future finding on every site that
 * loads it — which is why it is ranked across tenants (see the note in
 * `getUnknownDomains`) and why it sits above the catalogue rather than below.
 *
 * ⚠️ THE FORM IS AN UPSERT ON `slug`. Typing an existing slug edits that vendor
 * rather than failing on a unique constraint, which is what an operator fixing
 * a bad pattern actually wants.
 */
export default async function AdminTrackersPage({
  searchParams,
}: PageProps<"/admin/trackers">) {
  await requireSuperAdmin();
  const params = await searchParams;
  const prefill = typeof params.domain === "string" ? params.domain : undefined;

  const [unknown, vendors] = await Promise.all([
    getUnknownDomains(),
    listTrackerVendors(),
  ]);

  return (
    <AdminPage title={t("admin.trackersTitle")}>
      <AdminCard title={t("admin.trackersUnknownTitle")}>
        <p className="border-b border-border px-4 py-2.5 text-small text-muted-foreground">
          {t("admin.trackersUnknownSubtitle")}
        </p>
        <AdminTable
          columns={["Domain", t("admin.trackerOccurrences"), ""]}
          empty={unknown.length === 0}
        >
          {unknown.map((row) => (
            <tr key={row.domain}>
              <td className="px-3 py-2 font-mono text-mono">{row.domain}</td>
              <td className="px-3 py-2 tabular-nums">{formatNumber(row.occurrences)}</td>
              <td className="px-3 py-2 text-right">
                <a
                  href={`/admin/trackers?domain=${encodeURIComponent(row.domain)}#new-vendor`}
                  className="text-primary underline underline-offset-2"
                >
                  {t("admin.trackerCreateFromDomain")}
                </a>
              </td>
            </tr>
          ))}
        </AdminTable>
      </AdminCard>

      <div id="new-vendor">
        <AdminCard title={t("admin.trackerCreateFromDomain")}>
          {/*
            ⚠️ `key` FORCES A REMOUNT WHEN THE PREFILL CHANGES. Without it, React
            keeps the form's existing state and clicking "create vendor" on a
            second domain silently leaves the first one in the fields.
          */}
          <VendorForm
            key={prefill ?? "blank"}
            action={createTrackerVendorAction}
            initialDomain={prefill}
          />
        </AdminCard>
      </div>

      <AdminCard title={t("admin.trackersTitle")}>
        <AdminTable
          columns={[
            t("admin.trackerName"),
            t("admin.trackerCategory"),
            t("admin.trackerRisk"),
            t("admin.trackerPatterns"),
            "",
          ]}
          empty={vendors.length === 0}
        >
          {vendors.map((vendor) => (
            <tr key={vendor.id}>
              <td className="px-3 py-2">
                <span className="font-medium">{vendor.name}</span>
                <span className="block font-mono text-mono text-muted-foreground">
                  {vendor.slug}
                </span>
              </td>
              <td className="px-3 py-2">{vendor.category}</td>
              <td className="px-3 py-2">
                <AdminPill
                  tone={
                    vendor.riskLevel === "CRITICAL" || vendor.riskLevel === "HIGH"
                      ? "bad"
                      : vendor.riskLevel === "MEDIUM"
                        ? "warn"
                        : "neutral"
                  }
                >
                  {vendor.riskLevel}
                </AdminPill>
              </td>
              <td className="px-3 py-2 font-mono text-mono text-muted-foreground">
                {vendor.domainPatterns.slice(0, 3).join(", ")}
                {vendor.domainPatterns.length > 3
                  ? ` +${vendor.domainPatterns.length - 3}`
                  : ""}
              </td>
              <td className="px-3 py-2">
                {vendor.isEssentialCandidate ? (
                  <AdminPill tone="neutral">Essential candidate</AdminPill>
                ) : null}
                {!vendor.isActive ? <AdminPill tone="warn">Inactive</AdminPill> : null}
              </td>
            </tr>
          ))}
        </AdminTable>
      </AdminCard>
    </AdminPage>
  );
}
