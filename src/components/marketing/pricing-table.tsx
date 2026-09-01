"use client";

import Link from "next/link";
import { useState } from "react";
import { t } from "@pdm/shared/copy";
import {
  PLAN_CATALOGUE,
  SUPPORTED_CURRENCIES,
  annualSavingMinorUnits,
  isUnlimited,
  type CataloguePlan,
  type SupportedCurrency,
} from "@pdm/billing";
import { buttonClasses } from "@/components/ui/button";
import { CheckIcon, XIcon } from "@/components/ui/icons";
import { formatMoney, formatNumber } from "@/lib/format";
import { trackClient } from "@/lib/analytics-client";

/**
 * PRICING TABLE — PLAN.md §3.2 (`/pricing`), §9.3, Phase 6 task 6.4.
 *
 * ⚠️ A CLIENT ISLAND INSIDE A STATIC PAGE. `(marketing)/layout.tsx` states the
 * rule: marketing pages stay statically prerendered, and anything that reads
 * server-side auth or request state silently makes them dynamic. The interval
 * and currency are pure browser state, so they live here and the page around
 * them keeps prerendering.
 *
 * ⚠️ THE CURRENCY IS DISPLAY ONLY (§9.3, and the note on `PLAN_CATALOGUE`).
 * Checkout resolves the real Stripe Price server-side from the plan and the
 * requested currency, falling back to USD when we have not provisioned one.
 * Nothing a visitor picks here can change what they are charged.
 *
 * ⚠️ THE NUMBERS COME FROM THE CATALOGUE, NOT FROM THE DATABASE. A database
 * read would make the page dynamic and put a Postgres round trip on the busiest
 * public URL in the product. The catalogue is the same constant the seed writes
 * into `Plan`, so the two cannot disagree.
 */

const CURRENCY_LABEL: Record<SupportedCurrency, string> = {
  usd: "USD $",
  gbp: "GBP £",
  eur: "EUR €",
};

type Interval = "monthly" | "annual";

export function PricingTable() {
  const [interval, setInterval] = useState<Interval>("monthly");
  const [currency, setCurrency] = useState<SupportedCurrency>("usd");

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-center gap-4">
        <div
          role="group"
          aria-label={t("billing.interval")}
          className="flex rounded-md border border-border p-0.5"
        >
          {(["monthly", "annual"] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={interval === option}
              onClick={() => {
                setInterval(option);
                // §3.2's `pricing_interval_toggled`. Which way somebody toggles
                // is the cheapest available signal on whether the annual
                // discount is doing any work.
                trackClient("pricing_interval_toggled", { interval: option });
              }}
              className={
                interval === option
                  ? "rounded px-3 py-1.5 text-small font-medium bg-primary text-primary-foreground"
                  : "rounded px-3 py-1.5 text-small text-muted-foreground hover:text-foreground"
              }
            >
              {option === "monthly"
                ? t("pricing.intervalMonthly")
                : t("pricing.intervalAnnual")}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 text-small text-muted-foreground">
          {t("pricing.currencyLabel")}
          <select
            value={currency}
            onChange={(event) =>
              setCurrency(event.target.value as SupportedCurrency)
            }
            className="h-9 rounded-md border border-border bg-background px-2 text-small text-foreground"
          >
            {SUPPORTED_CURRENCIES.map((code) => (
              <option key={code} value={code}>
                {CURRENCY_LABEL[code]}
              </option>
            ))}
          </select>
        </label>

        {interval === "annual" ? (
          <span className="rounded-full bg-success-muted px-2.5 py-1 text-caption text-success">
            {t("pricing.annualNote")}
          </span>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-4">
        {PLAN_CATALOGUE.map((plan) => (
          <PlanCard
            key={plan.key}
            plan={plan}
            interval={interval}
            currency={currency}
          />
        ))}
      </div>

      <p className="text-center text-caption text-muted-foreground">
        {t("pricing.currencyNote")}
      </p>

      <ComparisonTable currency={currency} interval={interval} />
    </div>
  );
}

function PlanCard({
  plan,
  interval,
  currency,
}: {
  plan: CataloguePlan;
  interval: Interval;
  currency: SupportedCurrency;
}) {
  const prices = plan.prices[currency];
  /*
   * ⚠️ AN ANNUAL PLAN IS PRICED PER MONTH WITH THE BILLING TERM SPELLED OUT.
   * Showing $1,490 beside $149 makes the annual option look ten times more
   * expensive at a glance — the comparison a visitor actually makes is monthly
   * against monthly, and the annual line then has to say it is billed yearly or
   * it is a surprise at checkout.
   */
  const perMonth = interval === "annual" ? Math.round(prices.annual / 12) : prices.monthly;
  const saving = annualSavingMinorUnits(plan, currency);

  return (
    <div
      className={
        plan.featured
          ? "relative flex flex-col gap-3 rounded-lg border-2 border-primary bg-card p-5"
          : "relative flex flex-col gap-3 rounded-lg border border-border bg-card p-5"
      }
    >
      {plan.featured ? (
        <span className="absolute -top-2.5 left-5 rounded-full bg-primary px-2.5 py-0.5 text-caption font-medium text-primary-foreground">
          {t("pricing.mostPopular")}
        </span>
      ) : null}

      <h3 className="text-h4">{plan.name}</h3>
      <p className="text-caption text-muted-foreground">{plan.description}</p>

      <p className="text-h1 tabular-nums">
        {formatMoney(perMonth, currency)}
        <span className="text-caption font-normal text-muted-foreground">
          {interval === "annual"
            ? t("pricing.perMonthAnnual")
            : t("pricing.perMonth")}
        </span>
      </p>
      {interval === "annual" ? (
        <p className="text-caption text-success">
          {t("pricing.saveAmount")} {formatMoney(saving, currency)}
        </p>
      ) : null}

      <ul className="flex flex-col gap-1.5 text-small">
        {/*
          ⚠️ DEDICATED CARD COPY, NOT `.toLowerCase()` ON THE TABLE LABELS. The
          first attempt lowercased the comparison-row labels to make them read as
          a list, which turned "AI credits per month" into "ai credits per
          month". Case is not a formatting concern in a language with acronyms.
        */}
        <Feature>
          {formatNumber(plan.entitlements.maxWebsites)} {t("pricing.cardWebsites")}
        </Feature>
        <Feature>
          {formatNumber(plan.entitlements.maxScansPerMonth)} {t("pricing.cardScans")}
        </Feature>
        <Feature>
          {formatNumber(plan.entitlements.aiCreditsPerMonth)} {t("pricing.cardCredits")}
        </Feature>
        <Feature included={plan.entitlements.whiteLabel}>
          {t("pricing.rowWhiteLabel")}
        </Feature>
        <Feature included={plan.entitlements.clientPortal}>
          {t("pricing.rowPortal")}
        </Feature>
      </ul>

      <Link
        href="/signup"
        onClick={() =>
          trackClient("pricing_plan_cta_clicked", { plan: plan.key, interval })
        }
        className={buttonClasses(plan.featured ? "primary" : "secondary", "md", "mt-auto")}
      >
        {t("pricing.startTrial")}
      </Link>
    </div>
  );
}

function Feature({
  children,
  included = true,
}: {
  children: React.ReactNode;
  included?: boolean;
}) {
  /*
   * ⚠️ ICON PLUS TEXT, NEVER A COLOURED TICK ALONE (§11.6 / WCAG 1.4.1). An
   * excluded row is struck through AND crossed AND muted, so the answer
   * survives greyscale and a screen reader reads the label either way.
   */
  return (
    <li className="flex items-start gap-2">
      {included ? (
        <CheckIcon className="mt-0.5 shrink-0 text-success" />
      ) : (
        <XIcon className="mt-0.5 shrink-0 text-muted-foreground" />
      )}
      <span className={included ? undefined : "text-muted-foreground line-through"}>
        {children}
      </span>
    </li>
  );
}

/** §9.2's dimension list as comparison rows, in the order §9.3's table prints. */
const ROWS: Array<{ label: string; render: (plan: CataloguePlan) => React.ReactNode }> = [
  { label: t("pricing.rowWebsites"), render: (p) => count(p.entitlements.maxWebsites) },
  {
    label: t("pricing.rowFrequency"),
    render: (p) =>
      p.entitlements.scanFrequencies.includes("DAILY")
        ? "Daily, weekly, monthly"
        : "Weekly, monthly",
  },
  { label: t("pricing.rowScans"), render: (p) => count(p.entitlements.maxScansPerMonth) },
  { label: t("pricing.rowPages"), render: (p) => count(p.entitlements.maxPagesPerScan) },
  {
    label: t("pricing.rowConcurrent"),
    render: (p) => count(p.entitlements.maxConcurrentScans),
  },
  { label: t("pricing.rowTeam"), render: (p) => count(p.entitlements.maxTeamMembers) },
  { label: t("pricing.rowClients"), render: (p) => count(p.entitlements.maxClients) },
  {
    label: t("pricing.rowAiCredits"),
    render: (p) => count(p.entitlements.aiCreditsPerMonth),
  },
  { label: t("pricing.rowAiAdvanced"), render: (p) => yesNo(p.entitlements.aiAdvancedTier) },
  { label: t("pricing.rowWhiteLabel"), render: (p) => yesNo(p.entitlements.whiteLabel) },
  {
    label: t("pricing.rowPortal"),
    render: (p) =>
      !p.entitlements.clientPortal
        ? yesNo(false)
        : isUnlimited(p.entitlements.maxPortalUsers)
          ? t("billing.unlimited")
          : `${formatNumber(p.entitlements.maxPortalUsers)} ${t("pricing.portalUsers")}`,
  },
  {
    label: t("pricing.rowReportTypes"),
    render: (p) =>
      p.entitlements.reportTypes.length >= 5
        ? t("pricing.reportTypesAll")
        : t("pricing.reportTypesTwo"),
  },
  { label: t("pricing.rowReports"), render: (p) => count(p.entitlements.maxReportsPerMonth) },
  {
    label: t("pricing.rowEvidence"),
    render: (p) => `${formatNumber(p.entitlements.evidenceRetentionDays)} ${t("pricing.days")}`,
  },
  {
    label: t("pricing.rowHistory"),
    /*
     * ⚠️ DIVIDE BY A YEAR, NOT BY 30. §9.3's table says 12 / 24 / 36 months, and
     * the stored values are 365 / 730 / 1095 days — `days / 30` rounds 1095 to
     * 37, advertising a month we do not sell.
     */
    render: (p) =>
      `${Math.round((p.entitlements.scanHistoryRetentionDays / 365) * 12)} ${t("pricing.months")}`,
  },
  {
    label: t("pricing.rowIntegrations"),
    render: (p) => yesNo(p.entitlements.slackIntegration && p.entitlements.webhooks),
  },
  { label: t("pricing.rowApi"), render: (p) => yesNo(p.entitlements.apiAccess) },
  {
    label: t("pricing.rowSupport"),
    render: (p) =>
      p.entitlements.prioritySupport
        ? t("pricing.supportPriority")
        : t("pricing.supportEmail"),
  },
];

function count(value: number): string {
  return isUnlimited(value) ? t("billing.unlimited") : formatNumber(value);
}

function yesNo(value: boolean): React.ReactNode {
  return value ? (
    <span className="inline-flex items-center gap-1.5 text-success">
      <CheckIcon />
      <span className="sr-only">{t("pricing.included")}</span>
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
      <XIcon />
      <span className="sr-only">{t("pricing.notIncluded")}</span>
    </span>
  );
}

function ComparisonTable({
  currency,
  interval,
}: {
  currency: SupportedCurrency;
  interval: Interval;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-h2 tracking-tight">{t("pricing.compareTitle")}</h2>
      <p className="text-small text-muted-foreground lg:hidden">
        {t("pricing.compareNote")}
      </p>

      {/* The table scrolls inside its own container; the page body never
          scrolls sideways (§11.5). */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[46rem] border-collapse text-small">
          <caption className="sr-only">{t("pricing.compareTitle")}</caption>
          <thead>
            <tr className="border-b border-border bg-card">
              {/* The corner cell labels the ROW header column, so it carries an
                  accessible name without printing a redundant word. */}
              <th scope="col" className="px-4 py-3 text-left font-medium">
                <span className="sr-only">{t("pricing.compareFeature")}</span>
              </th>
              {PLAN_CATALOGUE.map((plan) => (
                <th key={plan.key} scope="col" className="px-4 py-3 text-left font-medium">
                  <span className="block">{plan.name}</span>
                  <span className="block text-caption font-normal text-muted-foreground tabular-nums">
                    {formatMoney(
                      interval === "annual"
                        ? Math.round(plan.prices[currency].annual / 12)
                        : plan.prices[currency].monthly,
                      currency,
                    )}
                    {t("pricing.perMonth")}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {ROWS.map((row) => (
              <tr key={row.label}>
                <th scope="row" className="px-4 py-2.5 text-left font-normal text-muted-foreground">
                  {row.label}
                </th>
                {PLAN_CATALOGUE.map((plan) => (
                  <td key={plan.key} className="px-4 py-2.5 tabular-nums">
                    {row.render(plan)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
