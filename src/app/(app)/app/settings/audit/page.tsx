import Link from "next/link";
import { repositoriesFor } from "@pdm/database/repositories";
import { t } from "@pdm/shared/copy";
import { Card } from "@/components/ui/card";
import { FilterForm, SelectField } from "@/components/ui/filter-form";
import { DataList, type Column, type Row } from "@/components/ui/data-list";
import { EmptyState } from "@/components/ui/empty-state";
import { MutedBadge } from "@/components/ui/severity-badge";
import { formatDateTime } from "@/lib/format";
import { requirePermission } from "@/server/auth/context";

/**
 * AUDIT LOG — §5.6, §3.12, Phase 1 task 1.10.
 *
 * ⚠️ CURSOR-PAGINATED, not offset. The trail is unbounded and time-ordered, so
 * an offset page drifts as new rows land: paging from 1 to 2 while a scan
 * writes an entry shows you a row you already read and skips one you have not
 * (§6.3).
 *
 * ⚠️ IT SHOWS WHAT CHANGED, NOT THE WHOLE ROW. `before`/`after` hold only the
 * keys that moved (§10.6 minimisation) — an audit trail that snapshots every
 * column quietly becomes a second copy of the data it was meant to protect.
 *
 * ⚠️ THE CSV EXPORT LINK CARRIES THE SAME FILTERS as the view (§3.11). An
 * export that ignored them would hand someone the whole trail when they asked
 * for one client's week — which is both a surprise and a minimisation problem.
 */
const PER_PAGE = 50;

export default async function AuditLogPage({
  searchParams,
}: PageProps<"/app/settings/audit">) {
  // Reading the audit log is a settings capability — it exposes who did what
  // across the whole agency, which is not something every role should see.
  const ctx = await requirePermission("settings:read");
  const repos = repositoriesFor(ctx.agencyId);

  const raw = await searchParams;
  const first = (key: string): string | undefined => {
    const value = raw[key];
    const single = Array.isArray(value) ? value[0] : value;
    return single === "" ? undefined : single;
  };

  const cursor = first("cursor");
  const filters = {
    action: first("action"),
    entityType: first("entity"),
  };

  const page = await repos.audit.list({ ...filters, cursor, limit: PER_PAGE });

  // Filter values come from the AuditAction union rather than from a DISTINCT
  // query: the list is fixed and small, and a query would omit actions that
  // have simply not happened yet in this tenant.
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({
    action: filters.action,
    entity: filters.entityType,
  })) {
    if (value) params.set(key, value);
  }
  const exportHref = `/api/v1/settings/audit/export${params.size > 0 ? `?${params}` : ""}`;
  const olderParams = new URLSearchParams(params);
  if (page.nextCursor) olderParams.set("cursor", page.nextCursor);
  const olderHref = `/app/settings/audit?${olderParams}`;
  const filtered = filters.action !== undefined || filters.entityType !== undefined;

  const columns: Column[] = [
    { key: "action", label: t("audit.columnAction") },
    { key: "entity", label: t("audit.columnEntity"), hideBelow: "lg" },
    { key: "actor", label: t("audit.columnActor") },
    { key: "when", label: t("audit.columnWhen"), align: "end" },
  ];

  const rows: Row[] = page.items.map((entry) => ({
    id: entry.id,
    primary: <span className="font-mono text-mono">{entry.action}</span>,
    secondary: entry.entityId,
    cells: {
      entity: <MutedBadge>{entry.entityType}</MutedBadge>,
      actor: (
        <span className="text-muted-foreground">
          {entry.user
            ? [entry.user.firstName, entry.user.lastName].filter(Boolean).join(" ") ||
              entry.user.email
            : t("audit.system")}
        </span>
      ),
      when: (
        <time dateTime={entry.createdAt.toISOString()} className="text-muted-foreground">
          {formatDateTime(entry.createdAt, ctx.timezone)}
        </time>
      ),
    },
  }));

  return (
    <div className="flex flex-col gap-4">
      <FilterForm clearHref={filtered ? "/app/settings/audit" : undefined}>
        <SelectField
          name="action"
          label={t("audit.filterAction")}
          defaultValue={filters.action}
          options={[
            { value: "", label: t("audit.anyAction") },
            ...AUDIT_ACTIONS.map((action) => ({ value: action, label: action })),
          ]}
        />
        <SelectField
          name="entity"
          label={t("audit.filterEntity")}
          defaultValue={filters.entityType}
          options={[
            { value: "", label: t("audit.anyEntity") },
            ...ENTITY_TYPES.map((entity) => ({ value: entity, label: entity })),
          ]}
        />
      </FilterForm>

      <div className="flex flex-wrap items-center gap-3">
        <p className="min-w-[14rem] flex-1 text-caption text-muted-foreground">
          {t("audit.exportNote")}
        </p>
        {/*
          A plain <a>, not a Link: this is a file download, and Next's client
          router would try to treat the CSV response as a navigation.
        */}
        <a
          href={exportHref}
          download
          className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-background px-3.5 text-small font-medium hover:bg-muted max-sm:h-11"
        >
          {t("audit.exportCsv")}
        </a>
      </div>

    <Card>
      {rows.length === 0 ? (
        <EmptyState title={t("audit.title")} body={t("empty.noAuditEntries")} />
      ) : (
        <DataList
          caption={t("audit.title")}
          columns={columns}
          rows={rows}
          footer={
            page.nextCursor ? (
              <Link
                href={olderHref}
                className="ms-auto text-small text-primary underline-offset-2 hover:underline"
              >
                {t("audit.older")} →
              </Link>
            ) : (
              <span className="ms-auto">{t("audit.endOfLog")}</span>
            )
          }
        />
      )}
    </Card>
    </div>
  );
}

/**
 * The filterable action list, kept in step with `AuditAction` in
 * `packages/database/src/repositories/audit.repository.ts`.
 *
 * ⚠️ Not derived from a DISTINCT query on purpose: that would hide every action
 * a tenant has not performed yet, so a new agency would see an almost empty
 * filter and conclude the trail was broken.
 */
const AUDIT_ACTIONS = [
  "website.created",
  "website.updated",
  "website.paused",
  "website.resumed",
  "website.archived",
  "website.deleted",
  "website.imported",
  "client.created",
  "client.updated",
  "client.archived",
  "client.portal_enabled",
  "client.portal_disabled",
  "issue.status_changed",
  "issue.assigned",
  "issue.ignored",
  "evidence.exported",
  "report.generated",
  "report.shared",
  "report.deleted",
  "member.invited",
  "member.role_changed",
  "member.removed",
  "agency.updated",
  "branding.updated",
  "scan.triggered",
  "scan.cancelled",
  "portal.login",
  "portal.issues_viewed",
  "portal.report_downloaded",
] as const;

const ENTITY_TYPES = [
  "website",
  "client",
  "issue",
  "scan",
  "report",
  "report_share",
  "alert_rule",
  "agency_branding",
  "portal_user",
  "member",
] as const;
