import { t } from "@pdm/shared/copy";
import { Card } from "@/components/ui/card";
import { DataList, type Column, type Row } from "@/components/ui/data-list";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterForm, SelectField } from "@/components/ui/filter-form";
import { Pagination } from "@/components/ui/pagination";
import { MutedBadge, SeverityBadge, StatusBadge } from "@/components/ui/severity-badge";
import { formatNumber, formatRelative } from "@/lib/format";
import { ISSUE_STATUS_LABEL, ISSUE_STATUS_TONE } from "@/lib/labels";
import { requireWebsiteAccess } from "@/server/auth/context";
import { getIssueList } from "@/server/queries/issues";

/**
 * WEBSITE DETAIL — ISSUES TAB — §3.8, Phase 3 task 3.10.
 *
 * The same queue as `/app/issues`, scoped to one website. It reuses
 * `getIssueList` rather than growing a parallel query: two code paths for
 * "which findings are open" is how a count in the header stops matching the
 * rows beneath it.
 *
 * ⚠️ THE WEBSITE FILTER IS FORCED, not defaulted. A `?website=` in the URL must
 * not be able to widen this tab to another site — it is overwritten below after
 * parsing, so a hand-edited link shows this website or nothing.
 */
export default async function WebsiteIssuesPage({
  params,
  searchParams,
}: PageProps<"/app/websites/[websiteId]/issues">) {
  const { websiteId } = await params;
  const ctx = await requireWebsiteAccess(websiteId);

  const raw = await searchParams;
  const { query, page } = await getIssueList(ctx, { ...raw, website: websiteId });

  const now = new Date();

  const columns: Column[] = [
    { key: "issue", label: t("issues.columnIssue") },
    { key: "severity", label: t("issues.columnSeverity") },
    { key: "status", label: t("issues.columnStatus") },
    { key: "seen", label: t("issues.columnLastSeen"), align: "end" },
  ];

  const rows: Row[] = page.items.map((issue) => ({
    id: issue.id,
    href: `/app/issues/${issue.id}`,
    primary: issue.title,
    // The rule id, monospaced — how a finding traces back to §4.11's table.
    secondary: issue.ruleId,
    cells: {
      severity: <SeverityBadge severity={issue.severity} />,
      status: (
        <StatusBadge
          tone={ISSUE_STATUS_TONE[issue.status]}
          label={ISSUE_STATUS_LABEL[issue.status]}
        />
      ),
      seen: (
        <span className="flex items-center justify-end gap-2">
          {issue.occurrenceCount > 1 ? (
            <MutedBadge>×{formatNumber(issue.occurrenceCount)}</MutedBadge>
          ) : null}
          <time
            dateTime={issue.lastSeenAt.toISOString()}
            className="text-muted-foreground"
          >
            {formatRelative(issue.lastSeenAt, now)}
          </time>
        </span>
      ),
    },
  }));

  const filtered = query.status !== undefined || query.severity !== undefined;

  return (
    <div className="flex flex-col gap-4">
      <FilterForm
        clearHref={filtered ? `/app/websites/${websiteId}/issues` : undefined}
      >
        <SelectField
          name="severity"
          label={t("issues.filterSeverity")}
          defaultValue={query.severity?.[0]}
          options={[
            { value: "", label: t("filters.any") },
            { value: "CRITICAL", label: t("severity.critical") },
            { value: "HIGH", label: t("severity.high") },
            { value: "MEDIUM", label: t("severity.medium") },
            { value: "LOW", label: t("severity.low") },
            { value: "INFO", label: t("severity.info") },
          ]}
        />
        <SelectField
          name="status"
          label={t("issues.filterStatus")}
          defaultValue={query.status?.[0]}
          options={[
            { value: "", label: t("filters.all") },
            { value: "NEW", label: ISSUE_STATUS_LABEL.NEW },
            { value: "ACKNOWLEDGED", label: ISSUE_STATUS_LABEL.ACKNOWLEDGED },
            { value: "RESOLVED", label: ISSUE_STATUS_LABEL.RESOLVED },
            { value: "VERIFIED", label: ISSUE_STATUS_LABEL.VERIFIED },
            { value: "IGNORED", label: ISSUE_STATUS_LABEL.IGNORED },
          ]}
        />
      </FilterForm>

      <Card>
        {rows.length === 0 ? (
          <EmptyState
            title={t("issues.title")}
            body={filtered ? t("empty.noMatches") : t("empty.noIssues")}
          />
        ) : (
          <DataList
            caption={t("issues.title")}
            columns={columns}
            rows={rows}
            footer={
              <Pagination
                page={query.page}
                perPage={query.perPage}
                total={page.total}
                params={raw}
              />
            }
          />
        )}
      </Card>
    </div>
  );
}
