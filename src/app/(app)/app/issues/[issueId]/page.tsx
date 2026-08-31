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
import { readStoredOutput } from "@/server/services/ai";
import {
  IssueExplanationSection,
  IssueFixSection,
} from "@/components/ai/issue-ai-sections";
import { ClientMessageTrigger } from "@/components/ai/client-message-trigger";

/**
 * ISSUE DETAIL — §3.10, UI_DESIGN_PROMPTS §5.13, Phase 3 task 3.9,
 * Phase 5 task 5.7.
 *
 * The §5.13 spec lists eight ordered sections. Seven are built here; the eighth
 * is ABSENT rather than stubbed, for a stated reason:
 *
 *   - "ACTIVITY" needs `IssueActivity` rows; nothing writes them yet, so the
 *     timeline would render empty on every issue.
 *
 * Sections 7 (AI explanation) and 8 (recommended fix) arrived with Phase 5.
 *
 * ⚠️ THEY SIT BELOW THE DETERMINISTIC SECTIONS AND ADD TO THEM. Sections 1–6
 * are rule-authored: the same issue opened twice reads identically, which is
 * what makes it quotable in a client email. If the model never answers — no
 * credits, provider down, output rejected — those six sections are still a
 * complete finding, and the AI sections say so in as many words. That is P3
 * expressed as page layout rather than as a promise.
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

  /*
   * Both stored outputs are read in parallel with each other — two independent
   * indexed lookups that would otherwise serialise for no reason.
   *
   * `readStoredOutput` returns `null` when nothing has been generated, which is
   * the ordinary case and renders as the "not generated yet" state with a
   * button, not as an error.
   */
  const [explanation, fix] = await Promise.all([
    readStoredOutput(ctx, "EXPLAIN_ISSUE", "issue", issue.id),
    readStoredOutput(ctx, "RECOMMEND_FIX", "issue", issue.id),
  ]);

  /*
   * The links behind an output's citations.
   *
   * ⚠️ EVERY EVIDENCE ROW ON THE ISSUE IS PASSED, and the card filters to the
   * ones actually cited. Resolving only the cited refs here would mean a second
   * query per generation and a page that cannot render a freshly-returned
   * output's links without a round trip.
   */
  const evidenceLinks = issue.evidence.map((row) => ({
    ref: row.id,
    label: `${row.kind} · ${row.consentPhase}`,
    href: `/app/websites/${issue.website.id}/evidence?scan=${row.scanId}`,
  }));

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
          <div className="flex flex-col items-end gap-2">
            <IssueActions
              issueId={issue.id}
              status={issue.status}
              canTransition={can(ctx.role, "issue:transition")}
              canIgnore={can(ctx.role, "issue:ignore")}
            />
            {/* §8.5 feature 4. A DRAFT generator, not a sender — the dialog has
                no send button and no path to `@pdm/email`. */}
            {can(ctx.role, "ai:generate") ? (
              <ClientMessageTrigger
                websiteId={issue.website.id}
                issueIds={[issue.id]}
              />
            ) : null}
          </div>
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

      {/*
        Sections 7 and 8. `ai:read` gates whether they render at all; the
        separate `ai:generate` gates the button inside them, so a Viewer can
        read an explanation the team already paid for without being able to
        commission a new one (§6.1).

        ⚠️ THE STORED OUTPUT IS READ, NEVER GENERATED, ON RENDER. Opening an
        issue must not spend a credit — §8.9's "on-demand by default" is the
        lever that avoids paying to explain issues nobody opens.
      */}
      {can(ctx.role, "ai:read") ? (
        <>
          <IssueExplanationSection
            issueId={issue.id}
            initial={explanation}
            canGenerate={can(ctx.role, "ai:generate")}
            evidenceLinks={evidenceLinks}
          />
          <IssueFixSection
            issueId={issue.id}
            initial={fix}
            canGenerate={can(ctx.role, "ai:generate")}
            evidenceLinks={evidenceLinks}
          />
        </>
      ) : null}
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
