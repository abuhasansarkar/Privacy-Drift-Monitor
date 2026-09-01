"use client";

import { useState } from "react";
import { t } from "@pdm/shared/copy";
import { isUnlimited } from "@pdm/billing";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { CheckIcon } from "@/components/ui/icons";
import { formatMoney, formatNumber } from "@/lib/format";
import { CheckoutButton, PortalButton } from "./billing-actions";
import type { PlanOption } from "@/server/queries/billing";

/**
 * CHANGE PLAN — §3.11, Phase 6 task 6.3.
 *
 * "Change plan (opens Stripe Checkout for upgrades, Stripe Portal for
 * downgrades/cancellation)".
 *
 * ⚠️ THE UPGRADE/DOWNGRADE SPLIT IS NOT COSMETIC. A downgrade has to compute a
 * proration credit, may trigger a refund, and can leave the agency over its new
 * limits — Stripe's portal does the money part correctly and §9.2's grace
 * handles the limits part. Sending a downgrade through Checkout would create a
 * SECOND subscription rather than changing the existing one.
 *
 * ⚠️ THE COMPARISON IS BY `sortOrder`, NOT BY PRICE. Price is a currency-
 * dependent number and an annual figure is larger than a monthly one on a
 * cheaper plan; the catalogue's own ordering is the only stable answer to "is
 * this bigger than what I have".
 */
export function PlanPicker({
  plans,
  currency,
  hasSubscription,
}: {
  plans: PlanOption[];
  currency: string;
  hasSubscription: boolean;
}) {
  const [interval, setInterval] = useState<"MONTHLY" | "ANNUAL">("MONTHLY");
  const currentIndex = plans.findIndex((plan) => plan.current);

  return (
    <Card>
      <CardHeader
        title={hasSubscription ? t("billing.changePlan") : t("billing.choosePlan")}
        action={
          <div
            role="group"
            aria-label={t("billing.interval")}
            className="flex rounded-md border border-border p-0.5"
          >
            {(["MONTHLY", "ANNUAL"] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={interval === option}
                onClick={() => setInterval(option)}
                className={
                  interval === option
                    ? "rounded px-2.5 py-1 text-caption font-medium bg-primary text-primary-foreground"
                    : "rounded px-2.5 py-1 text-caption text-muted-foreground hover:text-foreground"
                }
              >
                {option === "MONTHLY" ? t("billing.monthly") : t("billing.annual")}
              </button>
            ))}
          </div>
        }
      />

      <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
        {plans.map((plan, index) => {
          const price =
            interval === "ANNUAL" ? plan.priceAnnualCents : plan.priceMonthlyCents;
          const isDowngrade = currentIndex >= 0 && index < currentIndex;

          return (
            <div
              key={plan.key}
              className={
                plan.current
                  ? "flex flex-col gap-2 rounded-lg border-2 border-primary p-3.5"
                  : "flex flex-col gap-2 rounded-lg border border-border p-3.5"
              }
            >
              <div className="flex items-center gap-2">
                <span className="font-medium">{plan.name}</span>
                {plan.current ? (
                  <Badge variant="secondary">{t("billing.currentPlanBadge")}</Badge>
                ) : null}
              </div>

              <p className="text-h3 tabular-nums">
                {formatMoney(price, plan.currency)}
                <span className="text-caption text-muted-foreground">
                  {" "}
                  {interval === "ANNUAL" ? t("billing.perYear") : t("billing.perMonth")}
                </span>
              </p>
              {interval === "ANNUAL" ? (
                <p className="text-caption text-success">{t("billing.annualSaving")}</p>
              ) : null}

              <ul className="flex flex-col gap-1 text-caption text-muted-foreground">
                <Feature>
                  {limitText(plan.entitlements.maxWebsites)} {t("billing.metricWebsites")}
                </Feature>
                <Feature>
                  {limitText(plan.entitlements.maxScansPerMonth)}{" "}
                  {t("billing.metricScans")}
                </Feature>
                <Feature>
                  {limitText(plan.entitlements.aiCreditsPerMonth)}{" "}
                  {t("billing.metricAiCredits")}
                </Feature>
                <Feature>
                  {limitText(plan.entitlements.maxTeamMembers)} {t("billing.metricSeats")}
                </Feature>
              </ul>

              <div className="mt-auto pt-2">
                {plan.current ? null : isDowngrade ? (
                  /*
                   * ⚠️ A DOWNGRADE IS A PORTAL TRIP, and the sentence beside it
                   * says why. Without it the button looks like the same action
                   * with a different label and the customer wonders why one
                   * plan sends them elsewhere.
                   */
                  <div className="flex flex-col gap-1">
                    <PortalButton label={t("billing.switchToPlan")} />
                    <p className="text-caption text-muted-foreground">
                      {t("billing.downgradeViaPortal")}
                    </p>
                  </div>
                ) : (
                  <CheckoutButton
                    planKey={plan.key}
                    interval={interval}
                    currency={currency}
                    variant={hasSubscription ? "secondary" : "primary"}
                    label={
                      hasSubscription
                        ? t("billing.switchToPlan")
                        : t("billing.startPlan")
                    }
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function Feature({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-1.5">
      <CheckIcon className="mt-0.5 shrink-0 text-success" />
      <span>{children}</span>
    </li>
  );
}

function limitText(limit: number): string {
  return isUnlimited(limit) ? t("billing.unlimited") : formatNumber(limit);
}
