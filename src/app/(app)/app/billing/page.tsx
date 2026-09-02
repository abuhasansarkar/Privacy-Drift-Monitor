import { t } from "@pdm/shared/copy";
import { can } from "@pdm/shared/permissions";
import { BillingBanners } from "@/components/billing/billing-banners";
import { CheckoutConfirming } from "@/components/billing/checkout-confirming";
import { InvoiceTable } from "@/components/billing/invoice-table";
import { PlanCard } from "@/components/billing/plan-card";
import { PlanPicker } from "@/components/billing/plan-picker";
import { UsageMeters } from "@/components/billing/usage-meters";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requirePermission } from "@/server/auth/context";
import { getBillingPageData } from "@/server/queries/billing";

/**
 * `/app/billing` — PLAN.md Part III §3.11, Part IX §9.1–§9.3, Phase 6 task 6.3.
 *
 * ⚠️ `billing:read` GATES THE PAGE, `billing:manage` GATES THE BUTTONS. §6.2
 * gives Admin `billing:read` and reserves `billing:manage` for the Owner, so a
 * finance-curious Admin can see the meters and the invoices without being able
 * to change what the agency pays. Hiding the buttons is cosmetic — both API
 * routes call `requirePermission("billing:manage")` themselves.
 *
 * ⚠️ `?checkout=success` RENDERS A SPINNER, NOT A SUBSCRIPTION. §9.1: the
 * redirect is not evidence of anything. See `CheckoutConfirming`.
 */
export default async function BillingPage({
  searchParams,
}: PageProps<"/app/billing">) {
  const ctx = await requirePermission("billing:read");
  // `searchParams` is a Promise in Next 16 (AGENTS.md).
  const params = await searchParams;
  const data = await getBillingPageData(ctx);

  const canManage = can(ctx.role, "billing:manage");
  const checkout = typeof params.checkout === "string" ? params.checkout : null;
  /*
   * ⚠️ THE SPINNER STOPS WHEN THE PROJECTION IS LIVE, not when the URL says so.
   * A customer who bookmarks `?checkout=success` and returns next month sees
   * their real plan, because `status` is already ACTIVE and the condition below
   * is false.
   */
  const confirming =
    checkout === "success" && data.status !== "ACTIVE" && data.status !== "TRIALING";

  return (
    <div className="flex w-full flex-col gap-5">
      <PageHeader title={t("billing.title")} subtitle={t("billing.subtitle")} />

      {confirming ? <CheckoutConfirming /> : null}
      {checkout === "cancelled" ? (
        <Card className="p-4 text-small text-muted-foreground">
          {t("billing.checkoutCancelled")}
        </Card>
      ) : null}

      <BillingBanners data={data} />

      <PlanCard data={data} timeZone={ctx.timezone} canManage={canManage} />

      <UsageMeters usage={data.usage} timeZone={ctx.timezone} />

      {canManage ? (
        <PlanPicker
          plans={data.plans}
          currency={data.currency}
          hasSubscription={data.planKey !== null}
          currentInterval={data.interval}
        />
      ) : null}

      <InvoiceTable stripe={data.stripe} timeZone={ctx.timezone} />
    </div>
  );
}
