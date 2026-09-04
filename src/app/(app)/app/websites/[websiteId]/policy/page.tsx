import { repositoriesFor } from "@pdm/database/repositories";
import { t } from "@pdm/shared/copy";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { MutedBadge, StatusBadge } from "@/components/ui/severity-badge";
import { requireWebsiteAccess } from "@/server/auth/context";
import { formatDate } from "@/lib/format";

/**
 * PRIVACY POLICY AUDIT TAB — Module 23 (Phase 14).
 *
 * Reconciles declared privacy policy claims against observed technical tracker reality.
 * Under FTC Act Section 5 and CCPA, undisclosed marketing and analytics trackers
 * constitute deceptive omissions.
 */
export default async function PolicyTabPage({
  params,
}: PageProps<"/app/websites/[websiteId]/policy">) {
  const { websiteId } = await params;
  const ctx = await requireWebsiteAccess(websiteId);
  const repos = repositoriesFor(ctx.agencyId);

  const policyAudit = await repos.db.policyAudit.findFirst({
    where: { websiteId },
    orderBy: { createdAt: "desc" },
    include: {
      scan: {
        select: {
          id: true,
          startedAt: true,
          finishedAt: true,
        },
      },
    },
  });

  if (!policyAudit) {
    return (
      <Card>
        <EmptyState
          title={t("policyTab.emptyTitle")}
          body={t("policyTab.emptyDescription")}
        />
      </Card>
    );
  }

  const effectiveDate = policyAudit.effectiveDate;
  const ageDays = effectiveDate
    ? Math.floor((policyAudit.createdAt.getTime() - effectiveDate.getTime()) / (24 * 60 * 60 * 1000))
    : null;
  const isStale = ageDays !== null && ageDays > 365;

  const score = policyAudit.complianceScore;
  const scoreTone = score >= 80 ? "text-success" : score >= 50 ? "text-warning" : "text-danger";
  const progressBg = score >= 80 ? "bg-success" : score >= 50 ? "bg-warning" : "bg-danger";

  return (
    <div className="flex flex-col gap-6">
      {/* Header metadata summary */}
      <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <span className="text-small font-medium text-muted-foreground">
            {t("policyTab.policyUrl")}
          </span>
          <a
            href={policyAudit.policyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-small text-primary underline-offset-4 hover:underline break-all"
          >
            {policyAudit.policyUrl} ↗
          </a>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-small font-medium text-muted-foreground">
              {t("policyTab.effectiveDate")}
            </span>
            <div className="flex items-center gap-2">
              <span className="text-small font-medium text-foreground">
                {effectiveDate ? formatDate(effectiveDate, ctx.timezone) : "Not stated"}
              </span>
              {effectiveDate ? (
                isStale ? (
                  <StatusBadge tone="warning" label={`${ageDays}d old (${t("policyTab.staleDate")})`} />
                ) : (
                  <StatusBadge tone="success" label={t("policyTab.freshDate")} />
                )
              ) : null}
            </div>
          </div>
        </div>
      </Card>

      {/* KPI & Alignment Score Card */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card className="flex flex-col justify-between p-5 md:col-span-2">
          <div className="flex items-center justify-between">
            <span className="text-small font-medium text-muted-foreground">
              {t("policyTab.alignmentScore")}
            </span>
            <span className={`text-h2 font-semibold ${scoreTone}`}>{score}%</span>
          </div>
          <div className="mt-4 flex flex-col gap-2">
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full transition-all ${progressBg}`}
                style={{ width: `${Math.max(5, score)}%` }}
              />
            </div>
            <p className="text-caption text-muted-foreground">
              {policyAudit.undisclosedVendors.length === 0
                ? "All observed trackers are named in the published privacy policy."
                : `${policyAudit.undisclosedVendors.length} detected tracker(s) are missing from policy declarations.`}
            </p>
          </div>
        </Card>

        <Card className="flex flex-col justify-between p-5">
          <span className="text-small font-medium text-muted-foreground">
            {t("policyTab.declaredTitle")}
          </span>
          <span className="text-h3 font-semibold text-foreground">
            {policyAudit.declaredVendors.length}
          </span>
          <span className="text-caption text-muted-foreground">
            Named in published policy
          </span>
        </Card>

        <Card className="flex flex-col justify-between p-5">
          <span className="text-small font-medium text-muted-foreground">
            {t("policyTab.undisclosedTitle")}
          </span>
          <span
            className={`text-h3 font-semibold ${
              policyAudit.undisclosedVendors.length > 0 ? "text-danger" : "text-success"
            }`}
          >
            {policyAudit.undisclosedVendors.length}
          </span>
          <span className="text-caption text-muted-foreground">
            {policyAudit.undisclosedVendors.length > 0
              ? "Potential FTC compliance issues"
              : "No undisclosed trackers"}
          </span>
        </Card>
      </div>

      {/* Undisclosed Trackers (Ghost Trackers) Warning Section */}
      {policyAudit.undisclosedVendors.length > 0 ? (
        <Card className="border-s-4 border-s-danger p-5">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <StatusBadge tone="danger" label="High Priority" />
              <h3 className="text-h4 font-semibold text-foreground">
                {t("policyTab.undisclosedTitle")}
              </h3>
            </div>
            <p className="text-small text-muted-foreground">
              {t("policyTab.undisclosedDesc")}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {policyAudit.undisclosedVendors.map((vendor: string) => (
                <span
                  key={vendor}
                  className="inline-flex items-center gap-1.5 rounded-md border border-danger/30 bg-danger/10 px-2.5 py-1 font-mono text-small font-semibold text-danger"
                >
                  ⚠ {vendor}
                </span>
              ))}
            </div>
          </div>
        </Card>
      ) : null}

      {/* Comparison Matrix: Declared vs Observed */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Declared Vendors */}
        <Card className="flex flex-col gap-4 p-5">
          <div>
            <h3 className="text-h4 font-semibold text-foreground">
              {t("policyTab.declaredTitle")}
            </h3>
            <p className="text-caption text-muted-foreground">
              {t("policyTab.declaredDesc")}
            </p>
          </div>
          {policyAudit.declaredVendors.length === 0 ? (
            <p className="text-small text-muted-foreground italic">
              No specific tracking vendors were identified in the policy text.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {policyAudit.declaredVendors.map((vendor: string) => (
                <MutedBadge key={vendor}>{vendor}</MutedBadge>
              ))}
            </div>
          )}
        </Card>

        {/* Observed Trackers */}
        <Card className="flex flex-col gap-4 p-5">
          <div>
            <h3 className="text-h4 font-semibold text-foreground">
              {t("policyTab.detectedTitle")}
            </h3>
            <p className="text-caption text-muted-foreground">
              {t("policyTab.detectedDesc")}
            </p>
          </div>
          {policyAudit.detectedVendors.length === 0 ? (
            <p className="text-small text-muted-foreground italic">
              No third-party trackers detected during the latest scan.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {policyAudit.detectedVendors.map((vendor: string) => {
                const isUndisclosed = policyAudit.undisclosedVendors.some(
                  (u: string) =>
                    u.toLowerCase() === vendor.toLowerCase() ||
                    vendor.toLowerCase().includes(u.toLowerCase()),
                );
                return (
                  <span
                    key={vendor}
                    className={`inline-flex items-center rounded-md border px-2.5 py-1 text-small font-medium ${
                      isUndisclosed
                        ? "border-danger/30 bg-danger/10 text-danger"
                        : "border-border bg-muted text-foreground"
                    }`}
                  >
                    {isUndisclosed ? `⚠ ${vendor}` : `✓ ${vendor}`}
                  </span>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {/* Stale / Unobserved Vendors */}
      {policyAudit.staleVendors.length > 0 ? (
        <Card className="flex flex-col gap-3 p-5">
          <div>
            <h4 className="text-small font-semibold text-foreground">
              {t("policyTab.staleVendorsTitle")}
            </h4>
            <p className="text-caption text-muted-foreground">
              {t("policyTab.staleVendorsDesc")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {policyAudit.staleVendors.map((vendor: string) => (
              <span
                key={vendor}
                className="inline-flex items-center rounded-md border border-dashed border-border px-2.5 py-1 text-small text-muted-foreground"
              >
                {vendor}
              </span>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
