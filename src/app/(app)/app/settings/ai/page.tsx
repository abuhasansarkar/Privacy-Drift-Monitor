import { repositoriesFor } from "@pdm/database/repositories";
import { t } from "@pdm/shared/copy";
import { AiSettingsForm } from "@/components/settings/ai-settings-form";
import { AiUsageChart, AiUsageTable } from "@/components/ai/ai-usage-chart";
import { Card, CardHeader } from "@/components/ui/card";
import { StatTile } from "@/components/ui/stat-tile";
import { AlertTriangleIcon, SparkleIcon } from "@/components/ui/icons";
import { formatNumber } from "@/lib/format";
import { requirePermission } from "@/server/auth/context";
import { getAiUsage } from "@/server/queries/ai-usage";

/**
 * SETTINGS → AI — PLAN.md Part VIII §8.9, §3.11, Phase 5 task 5.8.
 *
 * ⚠️ THE METER AND THE FORM ARE ON THE SAME PAGE ON PURPOSE. §8.9 notifies at
 * 80% of the credit cap and blocks at 100%; the person who sets the cap is the
 * person who needs to see what it is doing. Splitting them would mean deciding
 * a budget on a page that cannot show the spend.
 *
 * ⚠️ NO CAP RENDERS AS *UNKNOWN*, NOT AS *UNLIMITED*. Billing lands in Phase 6;
 * until then `monthlyCreditCap` is usually null and the meter shows the count
 * with no bar rather than drawing progress against a made-up denominator — the
 * same rule `src/server/entitlements.ts` already states for website limits.
 */
export default async function AiSettingsPage() {
  // `ai:configure` is Admin-level: these switches decide what the agency spends.
  const ctx = await requirePermission("ai:configure");

  const [settings, usage] = await Promise.all([
    repositoriesFor(ctx.agencyId).ai.settings(),
    getAiUsage(ctx, 30),
  ]);

  return (
    <div className="flex flex-col gap-5">
      {/*
        ⚠️ THE "NO PROVIDER" BANNER IS FIRST, ABOVE THE FORM. With no API key
        configured, every switch below is inert — telling somebody that after
        they have set a budget and pressed Save wastes their time and makes the
        product look broken rather than unconfigured.
      */}
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

      <Card className="p-4">
        <p className="flex items-start gap-2 text-small text-muted-foreground">
          <SparkleIcon className="mt-0.5" />
          {t("aiSettings.subtitle")}
        </p>
      </Card>

      <Card>
        <CardHeader title={t("aiSettings.usageTitle")} />
        <div className="flex flex-col gap-4 p-4">
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
            {/* Cache hits are a TOTAL, not a series — a stat tile, not a second
                line on the chart. They also cost 0 credits, which is the point
                worth making beside the credit count. */}
            <StatTile
              label={t("aiSettings.cacheHits")}
              value={formatNumber(usage.cacheHits)}
              note={t("aiSettings.cacheHitsNote")}
            />
            {/* §8.6: "a rising rate is the signal that a prompt needs
                revision". Shown to the agency too, because a rejection is a
                missing explanation they paid nothing for and should understand. */}
            <StatTile
              label={t("aiSettings.rejected")}
              value={formatNumber(usage.validationFailures)}
              note={t("aiSettings.rejectedNote")}
            />
          </div>

          {usage.percentUsed !== null ? (
            <div className="flex flex-col gap-1.5">
              <div
                className="h-2 w-full overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-valuenow={usage.percentUsed}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={t("aiSettings.creditsUsed")}
              >
                <div
                  className={
                    usage.nearingCap ? "h-full bg-warning" : "h-full bg-primary"
                  }
                  style={{ width: `${usage.percentUsed}%` }}
                />
              </div>
              {usage.nearingCap ? (
                // Colour PLUS icon PLUS text — never colour alone (§11.6).
                <p className="flex items-center gap-1.5 text-caption text-warning">
                  <AlertTriangleIcon />
                  {t("aiSettings.nearingCap")}
                </p>
              ) : null}
            </div>
          ) : null}

          <AiUsageChart days={usage.days} />
          <AiUsageTable days={usage.days} />
        </div>
      </Card>

      <AiSettingsForm
        initial={{
          /*
           * ⚠️ THE TWO DEFAULTS DIFFER FROM EACH OTHER, DELIBERATELY.
           *
           * `aiEnabled` defaults to true because that is the schema default and
           * an agency that never opened this page should still see
           * explanations when they ask for one — the cost of a button they
           * chose to press is a cost they chose.
           *
           * `autoExplainCritical` defaults to FALSE here even though the schema
           * column defaults to true, because it is the one switch that spends
           * money with nobody watching. `shouldAutoExplain()` in the service
           * layer resolves an absent row the same way; this form must agree
           * with it, or the checkbox would show "on" for behaviour that is off.
           */
          aiEnabled: settings?.aiEnabled ?? true,
          autoExplainCritical: settings?.autoExplainCritical ?? false,
          modelTier: settings?.modelTier ?? "STANDARD",
          monthlyCreditCap: settings?.monthlyCreditCap ?? null,
          featureToggles: {},
        }}
      />
    </div>
  );
}
