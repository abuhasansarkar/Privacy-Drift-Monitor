import Link from "next/link";
import { notFound } from "next/navigation";
import { t } from "@pdm/shared/copy";
import { can } from "@pdm/shared/permissions";
import { IssueEvidenceList } from "@/components/issues/issue-evidence-list";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { SeverityBadge, StatusBadge } from "@/components/ui/severity-badge";
import { IssueActions } from "@/components/issues/issue-actions";
import { RemediationDialog } from "@/components/issues/remediation-dialog";
import { formatDateTime, formatNumber, formatRelative } from "@/lib/format";
import { ISSUE_STATUS_LABEL, ISSUE_STATUS_TONE } from "@/lib/labels";
import { requirePermission } from "@/server/auth/context";
import { getIssueDetail } from "@/server/queries/issues";
import { readStoredOutput } from "@/server/services/ai";
import { repositoriesFor } from "@pdm/database/repositories";
import { IssueAssigneeSelect } from "@/components/issues/issue-assignee-select";
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
  const repos = repositoriesFor(ctx.agencyId);
  const [explanation, fix, members] = await Promise.all([
    readStoredOutput(ctx, "EXPLAIN_ISSUE", "issue", issue.id),
    readStoredOutput(ctx, "RECOMMEND_FIX", "issue", issue.id),
    repos.team.list(),
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

  // Derive vendorName and category dynamically from the issue and evidence
  let vendorName = "Marketing Tracker";
  if (issue.ruleId.startsWith("PDM-R031") || issue.ruleId.startsWith("PDM-R032")) {
    vendorName = "GPC Opt-Out Tag";
  } else {
    const reqEvidence = issue.evidence.find((e) => e.kind === "NETWORK_REQUEST");
    const cookieEvidence = issue.evidence.find((e) => e.kind === "COOKIE");
    if (reqEvidence && typeof reqEvidence.payload === "object" && reqEvidence.payload !== null) {
      const url = (reqEvidence.payload as Record<string, unknown>).url;
      if (typeof url === "string") {
        try {
          const host = new URL(url).hostname.replace(/^www\./, "");
          if (host) vendorName = host;
        } catch {
          // ignore
        }
      }
    } else if (cookieEvidence && typeof cookieEvidence.payload === "object" && cookieEvidence.payload !== null) {
      const domain = (cookieEvidence.payload as Record<string, unknown>).domain;
      if (typeof domain === "string") {
        const d = domain.replace(/^\./, "").replace(/^www\./, "");
        if (d) vendorName = d;
      }
    } else if (issue.title) {
      const firstWord = issue.title.split(" ")[0];
      if (firstWord && firstWord.length > 2 && !["Tracker", "Cookie", "Consent", "Unknown"].includes(firstWord)) {
        vendorName = firstWord;
      }
    }
  }

  const categoryMap: Record<string, "MARKETING" | "ANALYTICS" | "ADVERTISING" | "FUNCTIONAL"> = {
    TRACKER_WITHOUT_CONSENT: "MARKETING",
    COOKIE_WITHOUT_CONSENT: "ANALYTICS",
    STORAGE_WITHOUT_CONSENT: "FUNCTIONAL",
    FINGERPRINTING: "MARKETING",
    CLOAKING: "ADVERTISING",
    GPC_SIGNAL_IGNORED: "MARKETING",
    SESSION_REPLAY_ACTIVE: "ANALYTICS",
  };
  const category = categoryMap[issue.category] ?? "MARKETING";

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      {/*
        An issue is most often opened from an alert email or a client message,
        so the reader frequently arrives with no history and no idea which of
        their sites this is. The trail answers that before the title does.
      */}
      <Breadcrumbs
        items={[
          { label: t("issues.title"), href: "/app/issues" },
          {
            label: issue.website.url
              .replace(/^https?:\/\//, "")
              .replace(/\/$/, ""),
            href: `/app/websites/${issue.website.id}`,
          },
          { label: issue.ruleId },
        ]}
      />
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
            <span aria-hidden="true">·</span>
            <IssueAssigneeSelect
              issueId={issue.id}
              currentAssignee={issue.assignedTo}
              members={members.map((m) => ({
                id: m.id,
                userId: m.userId,
                user: {
                  id: m.user.id,
                  firstName: m.user.firstName,
                  lastName: m.user.lastName,
                  email: m.user.email,
                },
              }))}
              canAssign={can(ctx.role, "issue:assign")}
            />
          </span>
        }
        actions={
          <div className="flex flex-col items-end gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <RemediationDialog
                issueId={issue.id}
                websiteId={issue.website.id}
                ruleId={issue.ruleId}
                vendorName={vendorName}
                category={category}
              />
              <IssueActions
                issueId={issue.id}
                status={issue.status}
                canTransition={can(ctx.role, "issue:transition")}
                canIgnore={can(ctx.role, "issue:ignore")}
              />
            </div>
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
          ⚠️ THE ROWS THEMSELVES, NOT JUST A LINK TO THEM. This section used to
          render only "View the scan that recorded this →", so the one screen
          where an agency reads a finding — and from which they explain it to
          their client — showed no evidence at all, on a product whose entire
          claim is that every finding traces to something a browser observed.

          `IssueEvidenceList` renders `issue.evidence`, the same array already
          loaded above for `evidenceLinks` and the vendor-name derivation, so
          the old concern about "a second copy that can disagree" does not
          apply: there is no second source and nothing is summarised.

          The scan link stays — this list is the subset attached to THIS
          finding, and the scan holds everything else that was recorded.
        */}
        <div className="flex flex-col gap-3">
          <IssueEvidenceList
            rows={issue.evidence}
            unknownSubjectLabel={t("issues.evidenceSubjectUnknown")}
          />
          <Link
            href={`/app/websites/${issue.website.id}/scans/${issue.lastScanId}`}
            className="text-small text-primary underline-offset-2 hover:underline"
          >
            {t("issues.viewScan")} →
          </Link>
        </div>
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
