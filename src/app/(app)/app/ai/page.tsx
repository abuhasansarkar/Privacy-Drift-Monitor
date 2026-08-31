import Link from "next/link";
import { notFound } from "next/navigation";
import { t } from "@pdm/shared/copy";
import { Card, CardHeader } from "@/components/ui/card";
import { StatTile } from "@/components/ui/stat-tile";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import {
  AlertTriangleIcon,
  ChevronRightIcon,
  SparkleIcon,
} from "@/components/ui/icons";
import { formatNumber } from "@/lib/format";
import { requirePermission } from "@/server/auth/context";
import { getAiUsage } from "@/server/queries/ai-usage";
import { FLAGS, isFlagEnabled } from "@/server/flags";

/**
 * `/app/ai` — AI ASSISTANT — PLAN.md §3.9, Part VIII §8.5, Phase 5 task 5.7.
 *
 * §3.9: "a task-oriented panel, not a chat. Cards for the available AI actions
 * … each opening a form with a scoped selector … Shows remaining AI credits for
 * the period. V2 replaces this with the conversational Copilot (§8.10)."
 *
 * ⚠️ NOT A CHAT, AND THAT IS A SAFETY DECISION AS MUCH AS A SCOPE ONE. Every
 * MVP AI feature is grounded in a specific entity's evidence — an issue, a
 * website's drift, a named set of findings. A free-text box has no entity, so
 * it has no evidence to be grounded against, and the grounding check that makes
 * P2 mechanical would have nothing to check. The Copilot in §8.10 solves that
 * with a fixed tool set; until then, the answer is a scoped selector.
 *
 * ⚠️ EACH CARD LINKS TO WHERE THE WORK ALREADY HAPPENS rather than duplicating
 * the generator. The issue page owns explanation and fix; the Changes tab owns
 * the drift summary; the client message opens from an issue. A second copy of
 * each generator here would be a second place for the permission check, the
 * budget check and the AI label to drift out of step.
 *
 * ⚠️ FLAGGED `AI_ASSISTANT_PAGE`, DEFAULT OFF (§11.13). An unrouted 404 is the
 * correct response to a disabled page — a "this feature is not enabled" screen
 * tells an unauthorised visitor the route exists.
 */
export default async function AiAssistantPage() {
  // Manager+ per §3.9's page inventory; `ai:generate` is exactly that role cut.
  const ctx = await requirePermission("ai:generate");

  if (!(await isFlagEnabled(FLAGS.AI_ASSISTANT_PAGE, ctx.agencyId))) {
    notFound();
  }

  const usage = await getAiUsage(ctx, 30);

  const actions = [
    {
      title: t("ai.explanation"),
      body: t("aiAssistant.explainBody"),
      href: "/app/issues?severity=CRITICAL",
      cta: t("aiAssistant.pickIssue"),
    },
    {
      title: t("ai.recommendedFix"),
      body: t("aiAssistant.fixBody"),
      href: "/app/issues",
      cta: t("aiAssistant.pickIssue"),
    },
    {
      title: t("ai.driftSummary"),
      body: t("aiAssistant.driftBody"),
      href: "/app/drift",
      cta: t("aiAssistant.pickWebsite"),
    },
    {
      title: t("ai.clientMessage"),
      body: t("aiAssistant.messageBody"),
      href: "/app/issues",
      cta: t("aiAssistant.pickIssue"),
    },
  ];

  return (
    <div className="flex w-full flex-col gap-5">
      <PageHeader title={t("aiAssistant.title")} subtitle={t("aiAssistant.subtitle")} />

      {!usage.providerConfigured ? (
        <Card className="flex items-start gap-2.5 border-warning/40 bg-warning-muted p-4">
          <AlertTriangleIcon className="mt-0.5 text-warning" />
          <div>
            <p className="text-small font-medium">{t("aiSettings.noProviderTitle")}</p>
            <p className="text-small text-muted-foreground">
              {t("aiSettings.noProviderBody")}
            </p>
          </div>
        </Card>
      ) : null}

      {/*
        The credit meter §3.9 asks for. `creditCap === null` renders the count
        with no bar — "unknown", never "unlimited" (see `getAiUsage`).
      */}
      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile
          label={t("aiSettings.creditsUsed")}
          value={formatNumber(usage.creditsUsed)}
          note={
            usage.creditCap === null
              ? t("aiSettings.noCapSet")
              : `${t("aiSettings.ofCap")} ${formatNumber(usage.creditCap)}`
          }
        />
        <StatTile
          label={t("aiSettings.cacheHits")}
          value={formatNumber(usage.cacheHits)}
          note={t("aiSettings.cacheHitsNote")}
        />
        <StatTile
          label={t("aiSettings.rejected")}
          value={formatNumber(usage.validationFailures)}
          note={t("aiSettings.rejectedNote")}
        />
      </div>

      {usage.nearingCap ? (
        <p className="flex items-center gap-1.5 text-small text-warning">
          <AlertTriangleIcon />
          {t("aiSettings.nearingCap")}
        </p>
      ) : null}

      <Card>
        <CardHeader
          title={t("aiAssistant.actionsTitle")}
          action={
            <Link
              href="/app/settings/ai"
              className="text-small text-primary underline-offset-2 hover:underline"
            >
              {t("aiSettings.title")} →
            </Link>
          }
        />
        {actions.length === 0 ? (
          <EmptyState title={t("aiAssistant.title")} body={t("ai.notGeneratedYet")} />
        ) : (
          <ul className="divide-y divide-border">
            {actions.map((action) => (
              <li key={action.title}>
                <Link
                  href={action.href}
                  className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-muted"
                >
                  <SparkleIcon className="text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-small font-medium">{action.title}</span>
                    <span className="block text-caption text-muted-foreground">
                      {action.body}
                    </span>
                  </span>
                  <span className="shrink-0 text-caption text-muted-foreground">
                    {action.cta}
                  </span>
                  <ChevronRightIcon className="shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/*
        ⚠️ THE BOUNDARY STATEMENT, ON THE PAGE WHOSE WHOLE SUBJECT IS AI. §8.8
        lists opacity as a named risk; this page is where somebody forms their
        idea of what the AI layer is, so it says what it does and does not do
        before they use it.
      */}
      <Card className="p-4">
        <p className="text-small text-muted-foreground">{t("aiAssistant.boundary")}</p>
      </Card>
    </div>
  );
}
