import { t } from "@pdm/shared/copy";
import { SUBSCRIPTION_STATUS_LABEL } from "@pdm/shared/copy/labels";
import type { SubscriptionStatus } from "@pdm/schemas";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { formatDate, formatMoney } from "@/lib/format";
import { PortalButton } from "./billing-actions";
import type { BillingPageData } from "@/server/queries/billing";

/**
 * CURRENT PLAN CARD — §3.11, Phase 6 task 6.3.
 *
 * "name, price, interval, renewal date, status".
 *
 * ⚠️ THE STATUS BADGE IS NEVER THE ONLY SIGNAL. §11.6 forbids colour alone, and
 * a subscription status is exactly the kind of thing a colour-only chip renders
 * unreadably — the banner above the card carries the sentence, this carries the
 * label, and the two never disagree because both read the same `status`.
 */

const STATUS_TONE: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  ACTIVE: "default",
  TRIALING: "secondary",
  PAST_DUE: "destructive",
  UNPAID: "destructive",
  CANCELED: "destructive",
  INCOMPLETE: "outline",
  INCOMPLETE_EXPIRED: "destructive",
  PAUSED: "outline",
};

export function PlanCard({
  data,
  timeZone,
  canManage,
}: {
  data: BillingPageData;
  timeZone: string;
  canManage: boolean;
}) {
  if (!data.planName) {
    return (
      <Card>
        <CardHeader title={t("billing.currentPlan")} />
        <div className="flex flex-col gap-2 p-4">
          <p className="text-small font-medium">{t("billing.noPlanTitle")}</p>
          <p className="text-small text-muted-foreground">{t("billing.noPlanBody")}</p>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader title={t("billing.currentPlan")} />
      <div className="flex flex-wrap items-start gap-4 p-4">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="text-h3">{data.planName}</span>
            {data.status ? (
              <Badge variant={STATUS_TONE[data.status] ?? "outline"}>
                {SUBSCRIPTION_STATUS_LABEL[data.status as SubscriptionStatus]}
              </Badge>
            ) : null}
          </div>
          {data.priceCents !== null ? (
            <p className="text-small text-muted-foreground">
              {formatMoney(data.priceCents, data.currency)}{" "}
              {data.interval === "ANNUAL" ? t("billing.perYear") : t("billing.perMonth")}
            </p>
          ) : null}
          {data.currentPeriodEnd ? (
            <p className="text-caption text-muted-foreground">
              {/*
                ⚠️ "Access ends" WHEN A CANCELLATION IS SCHEDULED, "Renews"
                OTHERWISE — the same date means two opposite things, and printing
                "Renews 14 Oct" to somebody who cancelled is how a refund request
                starts.
              */}
              {data.cancelAtPeriodEnd ? t("billing.endsOn") : t("billing.renewsOn")}{" "}
              {formatDate(data.currentPeriodEnd, timeZone)}
            </p>
          ) : null}
          {data.cancelAtPeriodEnd ? (
            <p className="text-caption text-warning">{t("billing.cancelScheduled")}</p>
          ) : null}
        </div>

        {canManage ? (
          <div className="ml-auto flex flex-col items-end gap-1.5">
            <PortalButton />
            <p className="max-w-xs text-right text-caption text-muted-foreground">
              {t("billing.manageBillingHelp")}
            </p>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
