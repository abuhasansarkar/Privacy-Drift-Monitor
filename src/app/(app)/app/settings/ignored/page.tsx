import { repositoriesFor } from "@pdm/database/repositories";
import { t } from "@pdm/shared/copy";
import { can } from "@pdm/shared/permissions";
import { Card } from "@/components/ui/card";
import { DataList, type Column, type Row } from "@/components/ui/data-list";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { RevokeIgnoreButton } from "@/components/settings/revoke-ignore-button";
import { formatDateTime, formatNumber } from "@/lib/format";
import { requirePermission } from "@/server/auth/context";

/**
 * IGNORED FINDINGS — §3.5, Phase 3 task 3.5.
 *
 * ⚠️ THIS PAGE IS WHAT MAKES "IGNORE" DEFENSIBLE. Suppression happens at
 * creation time, so an ignored finding never regenerates and never alerts —
 * which is exactly right, and exactly why it is dangerous without somewhere to
 * see it. Six months on, "why does this site never report anything?" has to
 * have an answer, with the reason and who wrote it.
 */
export default async function IgnoredFindingsPage() {
  const ctx = await requirePermission("issue:read");
  const repos = repositoriesFor(ctx.agencyId);

  const now = new Date();
  const rules = await repos.issues.listIgnoreRules(now);

  const columns: Column[] = [
    { key: "reason", label: t("ignored.columnReason") },
    { key: "scope", label: t("ignored.columnScope") },
    { key: "created", label: t("ignored.columnCreated"), hideBelow: "lg" },
    { key: "action", label: "", align: "end" },
  ];

  const rows: Row[] = rules.map((rule) => ({
    id: rule.id,
    primary: rule.reason,
    secondary: rule.ruleId ?? undefined,
    cells: {
      scope: (
        <span className="font-mono text-mono text-muted-foreground">
          {/* null websiteId means agency-wide — say so, do not render blank. */}
          {rule.website?.url.replace(/^https?:\/\//, "") ?? t("ignored.agencyWide")}
        </span>
      ),
      created: (
        <time dateTime={rule.createdAt.toISOString()} className="text-muted-foreground">
          {formatDateTime(rule.createdAt, ctx.timezone)}
        </time>
      ),
      action: can(ctx.role, "issue:ignore") ? (
        <RevokeIgnoreButton ruleId={rule.id} />
      ) : null,
    },
  }));

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <PageHeader
        title={t("ignored.title")}
        subtitle={`${formatNumber(rules.length)} ${t("ignored.active")}`}
      />
      <Card>
        {rows.length === 0 ? (
          <EmptyState title={t("ignored.title")} body={t("empty.noIgnored")} />
        ) : (
          <DataList caption={t("ignored.title")} columns={columns} rows={rows} />
        )}
      </Card>
    </div>
  );
}
