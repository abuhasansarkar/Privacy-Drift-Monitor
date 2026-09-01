import type { ReactNode } from "react";
import { t } from "@pdm/shared/copy";
import { Card } from "@/components/ui/card";
import { AlertTriangleIcon, ClockIcon } from "@/components/ui/icons";
import { formatNumber } from "@/lib/format";
import { PortalButton } from "./billing-actions";
import type { BillingPageData } from "@/server/queries/billing";

/**
 * BILLING BANNERS — §3.11, §9.2, Phase 6 task 6.3.
 *
 * §3.11 asks for two ("Trial banner with days remaining. Past-due banner with a
 * retry-payment CTA"); §9.2's grace rule adds a third.
 *
 * ⚠️ THE PAST-DUE BANNER SAYS WHAT STILL WORKS. Feature doc 17's rule 3:
 * "Payment failure degrades to read-only scanning WITHOUT HIDING DATA." A
 * banner that only says "your payment failed" leaves the customer to guess
 * whether their evidence is gone — and guessing wrong is a support ticket and a
 * cancellation. The copy names the two things that stopped and states that
 * everything recorded stays available.
 *
 * ⚠️ THE GRACE BANNER NEVER THREATENS DELETION, because nothing is deleted.
 * §9.2: "auto-pauses, never deletes".
 */
export function BillingBanners({ data }: { data: BillingPageData }) {
  const banners: ReactNode[] = [];

  if (data.readOnly) {
    banners.push(
      <Banner
        key="read-only"
        tone="danger"
        title={t("billing.readOnlyTitle")}
        body={t("billing.readOnlyBody")}
        action={<PortalButton variant="primary" label={t("billing.updatePayment")} />}
      />,
    );
  }

  if (data.trialDaysLeft !== null && !data.readOnly) {
    banners.push(
      <Banner
        key="trial"
        tone="info"
        title={t("billing.trialBannerTitle")}
        body={`${formatNumber(data.trialDaysLeft)} ${t("billing.trialEndsIn")}`}
      />,
    );
  }

  if (data.overLimit.length > 0) {
    /*
     * ⚠️ THE DEADLINE IS PART OF THE MESSAGE. §9.2 gives 14 days and then
     * pauses the oldest excess sites; a banner that says "you are over your
     * limit" without saying when something happens gets read as advisory, and
     * the first the customer learns of the deadline is the email telling them
     * it passed. `daysLeft` comes from the same function the sweep uses.
     */
    banners.push(
      <Banner
        key="grace"
        tone="warning"
        title={t("billing.graceTitle")}
        body={
          data.grace.daysLeft !== null
            ? `${t("billing.graceBody")} ${formatNumber(data.grace.daysLeft)} ${t("billing.graceDaysLeft")}`
            : t("billing.graceBody")
        }
      />,
    );
  }

  if (!data.stripe.available) {
    banners.push(
      <Banner
        key="stripe-down"
        tone="warning"
        title={t("billing.unavailable")}
        body={t("billing.invoicesUnavailable")}
      />,
    );
  }

  if (banners.length === 0) return null;
  return <div className="flex flex-col gap-2.5">{banners}</div>;
}

const TONE = {
  danger: { card: "border-danger/40 bg-danger-muted", icon: "text-danger" },
  warning: { card: "border-warning/40 bg-warning-muted", icon: "text-warning" },
  info: { card: "border-info/40 bg-info-muted", icon: "text-info" },
} as const;

function Banner({
  tone,
  title,
  body,
  action,
}: {
  tone: keyof typeof TONE;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  // Colour PLUS icon PLUS text (§11.6) — the icon differs by tone as well as
  // the colour, so the state survives a greyscale screenshot.
  const Glyph = tone === "info" ? ClockIcon : AlertTriangleIcon;
  return (
    <Card className={`flex flex-wrap items-start gap-2.5 p-4 ${TONE[tone].card}`}>
      <Glyph className={`mt-0.5 ${TONE[tone].icon}`} />
      <div className="min-w-0 flex-1">
        <p className="text-small font-medium">{title}</p>
        <p className="text-small text-muted-foreground">{body}</p>
      </div>
      {action ? <div className="ml-auto">{action}</div> : null}
    </Card>
  );
}
