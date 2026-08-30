import Link from "next/link";
import { repositoriesFor } from "@pdm/database/repositories";
import { t } from "@pdm/shared/copy";
import { Card } from "@/components/ui/card";
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
  const cursor = Array.isArray(raw.cursor) ? raw.cursor[0] : raw.cursor;

  const page = await repos.audit.list({ cursor, limit: PER_PAGE });

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
                href={`/app/settings/audit?cursor=${page.nextCursor}`}
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
  );
}
