import Link from "next/link";
import { notFound } from "next/navigation";
import { t } from "@pdm/shared/copy";
import { can } from "@pdm/shared/permissions";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { SeverityBadge, StatusBadge } from "@/components/ui/severity-badge";
import { IssueActions } from "@/components/issues/issue-actions";
import { formatDateTime, formatNumber, formatRelative } from "@/lib/format";
import { ISSUE_STATUS_LABEL, ISSUE_STATUS_TONE } from "@/lib/labels";
import { requirePermission } from "@/server/auth/context";
import { getIssueDetail } from "@/server/queries/issues";

/**
 * ISSUE DETAIL — §3.10, UI_DESIGN_PROMPTS §5.13, Phase 3 task 3.9.
 *
 * The §5.13 spec lists eight ordered sections. Five are built here; the other
 * three are ABSENT rather than stubbed, and each for a stated reason:
 *
 *   - "AI EXPLANATION" is Phase 5. A section reading "coming soon" in the place
 *     where an explanation belongs is worse than no section, and P3 says
 *     findings must render with or without AI.
 *   - "DEVELOPER TASK" needs a per-vendor remediation catalogue we do not have.
 *     A generated snippet that does not fit the site's tag setup would be
 *     confidently wrong, which is worse than silent.
 *   - "ACTIVITY" needs `IssueActivity` rows; nothing writes them yet, so the
 *     timeline would render empty on every issue.
 *
 * ⚠️ Every string on this page is RULE-AUTHORED and deterministic (§6.5). The
 * same issue opened twice reads identically — that is what makes it quotable
 * in a client email.
 */
export default async function IssueDetailPage({
  params,
}: PageProps<"/app/issues/[issueId]">) {
  const { issueId } = await params;
  const ctx = await requirePermission("issue:read");

  const issue = await getIssueDetail(ctx, issueId);
  if (!issue) notFound();

  const now = new Date();

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2.5">
            <SeverityBadge severity={issue.severity} />
            <span className="text-h3">{issue.title}</span>
          </span>
        }
        subtitle={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <StatusBadge
              tone={ISSUE_STATUS_TONE[issue.status]}
              label={ISSUE_STATUS_LABEL[issue.status]}
            />
            <span aria-hidden="true">·</span>
            <Link
              href={`/app/websites/${issue.website.id}`}
              className="font-mono text-mono underline-offset-2 hover:underline"
            >
              {issue.website.url.replace(/^https?:\/\//, "")}
            </Link>
            <span aria-hidden="true">·</span>
            <span className="font-mono text-caption text-muted-foreground">
              {t("issues.ruleLabel")} {issue.ruleId}
            </span>
          </span>
        }
        actions={
          <IssueActions
            issueId={issue.id}
            status={issue.status}
            canTransition={can(ctx.role, "issue:transition")}
            canIgnore={can(ctx.role, "issue:ignore")}
          />
        }
      />

      <Section label={t("issues.whatHappened")}>
        <p className="text-body font-medium">{issue.message}</p>
      </Section>

      <Section label={t("issues.whyTechnical")}>
        <p className="text-small text-muted-foreground">{issue.technicalReason}</p>
      </Section>

      <Section label={t("issues.whenDetected")}>
        <dl className="grid gap-4 sm:grid-cols-3">
          <Metric label={t("issues.columnFirstDetected")}>
            <time dateTime={issue.firstDetectedAt.toISOString()}>
              {formatDateTime(issue.firstDetectedAt, ctx.timezone)}
            </time>
          </Metric>
          <Metric label={t("issues.columnLastSeen")}>
            <time dateTime={issue.lastSeenAt.toISOString()}>
              {formatRelative(issue.lastSeenAt, now)}
            </time>
          </Metric>
          <Metric label={t("issues.columnOccurrences")}>
            <span className="tabular-nums">
              {formatNumber(issue.occurrenceCount)}
            </span>
          </Metric>
        </dl>
      </Section>

      <Section label={t("issues.evidence")}>
        {/*
          The recorded rows live on the scan. Linking rather than duplicating
          them keeps ONE rendering of the evidence — a second, summarised copy
          here is a second thing that can disagree with what was recorded.
        */}
        <Link
          href={`/app/websites/${issue.website.id}/scans/${issue.lastScanId}`}
          className="text-small text-primary underline-offset-2 hover:underline"
        >
          {t("issues.viewScan")} →
        </Link>
      </Section>

      <Section label={t("issues.recommendedAction")}>
        <p className="text-small">{issue.recommendedAction}</p>
      </Section>
    </div>
  );
}

/** §5.13: each section is a bordered card with a 12px uppercase muted label. */
function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Card className="p-4 sm:p-5">
      <h2 className="text-caption font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </h2>
      <div className="mt-3">{children}</div>
    </Card>
  );
}

function Metric({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-caption text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-small font-medium">{children}</dd>
    </div>
  );
}
