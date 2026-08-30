import { t } from "@pdm/shared/copy";
import { Card } from "@/components/ui/card";
import { DataList, type Column, type Row } from "@/components/ui/data-list";
import { EmptyState } from "@/components/ui/empty-state";
import {
  FilterForm,
  SearchField,
  SelectField,
} from "@/components/ui/filter-form";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { MutedBadge, SeverityBadge, StatusBadge } from "@/components/ui/severity-badge";
import { formatNumber, formatRelative } from "@/lib/format";
import { ISSUE_STATUS_LABEL, ISSUE_STATUS_TONE } from "@/lib/labels";
import { requirePermission } from "@/server/auth/context";
import { getIssueList } from "@/server/queries/issues";

/**
 * ISSUE QUEUE — §3.8, UI_DESIGN_PROMPTS §5.12, Phase 3 task 3.9.
 *
 * A work list, not a report: ordered by severity first and recency second, so
 * a critical from last week outranks an info from this morning.
 *
 * ⚠️ IGNORED ISSUES ARE ABSENT BY DEFAULT, not filtered out at render time.
 * The repository excludes them from the query — an issue suppressed in the UI
 * but still counted in the score and still alerting is the "I told you to
 * ignore this" complaint that erodes trust (§3.5).
 *
 * ⚠️ NO SAVED-VIEW PILLS YET. §5.12 specifies them; they need a per-user
 * preference store, and a row of pills that forgets your view on reload is
 * worse than none. The filter bar below is URL-serialised, so a view IS a
 * shareable link in the meantime.
 */
export default async function IssuesPage({
  searchParams,
}: PageProps<"/app/issues">) {
  const ctx = await requirePermission("issue:read");
  const raw = await searchParams;
  const { query, page, counts } = await getIssueList(ctx, raw);

  const now = new Date();
  const unresolved = Object.values(counts).reduce((total, n) => total + n, 0);

  const columns: Column[] = [
    { key: "issue", label: t("issues.columnIssue") },
    { key: "severity", label: t("issues.columnSeverity") },
    { key: "website", label: t("issues.columnWebsite"), hideBelow: "lg" },
    { key: "status", label: t("issues.columnStatus") },
    { key: "seen", label: t("issues.columnLastSeen"), align: "end" },
  ];

  const rows: Row[] = page.items.map((issue) => ({
    id: issue.id,
    href: `/app/issues/${issue.id}`,
    primary: issue.title,
    // The rule id, monospaced beneath the title (§5.12) — it is how a finding
    // is discussed with us, and how it traces back to the rule that made it.
    secondary: issue.ruleId,
    cells: {
      severity: <SeverityBadge severity={issue.severity} />,
      website: (
        <span className="font-mono text-mono text-muted-foreground">
          {issue.website.url.replace(/^https?:\/\//, "")}
        </span>
      ),
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

  return (
    <div className="flex w-full flex-col gap-5">
      <PageHeader
        title={t("issues.title")}
        subtitle={`${formatNumber(unresolved)} ${t("issues.unresolved")}`}
      />

      <FilterForm
        clearHref={
          query.search || query.severity || query.status ? "/app/issues" : undefined
        }
      >
        <SearchField
          defaultValue={query.search}
          placeholder={t("issues.searchPlaceholder")}
        />
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
            { value: "IGNORED", label: ISSUE_STATUS_LABEL.IGNORED },
          ]}
        />
      </FilterForm>

      <Card>
        {rows.length === 0 ? (
          <EmptyState
            title={t("issues.title")}
            body={
              query.search || query.severity || query.status
                ? t("empty.noMatches")
                : t("empty.noIssues")
            }
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
