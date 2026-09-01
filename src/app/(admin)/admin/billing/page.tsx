import { t } from "@pdm/shared/copy";
import { AdminCard, AdminPage, AdminPill, AdminStat, AdminTable } from "@/components/admin/admin-ui";
import { formatDateTime, formatMoney, formatNumber } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { replayWebhookAction } from "@/server/admin/actions";
import { requireSuperAdmin } from "@/server/admin/context";
import { getBillingOverview } from "@/server/admin/queries";

/**
 * `/admin/billing` — PLAN.md §3.12, §9.1, Phase 6 task 6.6.
 *
 * ⚠️ THE WEBHOOK EVENT LOG IS THE POINT OF THIS PAGE. §9.1's failure table
 * names webhook loss as the billing failure that announces nothing: an agency
 * that upgraded stays on the old plan and hits limits it has paid to clear, and
 * one that cancelled keeps full service indefinitely. Both look normal from
 * inside the product. `StripeWebhookEvent` exists so that divergence is
 * visible, and this table is where somebody sees it.
 *
 * ⚠️ MRR HERE AND MRR ON `/admin` ARE THE SAME ARITHMETIC ON PURPOSE — an
 * annual plan contributes a twelfth, a trial contributes nothing. Two dashboards
 * that disagree about revenue is a support conversation with ourselves.
 */
export default async function AdminBillingPage() {
  await requireSuperAdmin();
  const billing = await getBillingOverview();

  return (
    <AdminPage title={t("admin.billingTitle")}>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <AdminStat label={t("admin.billingMrr")} value={formatMoney(billing.mrrCents, "usd")} />
        <AdminStat label={t("admin.billingArr")} value={formatMoney(billing.arrCents, "usd")} />
        <AdminStat
          label={t("admin.billingTrials")}
          value={formatNumber(billing.trialsEnding)}
        />
        <AdminStat
          label={t("admin.billingFailed")}
          value={formatNumber(billing.failedPayments)}
          tone={billing.failedPayments > 0 ? "warning" : undefined}
        />
      </div>

      <AdminCard title={t("admin.billingWebhooks")}>
        <AdminTable
          columns={["Event", "Type", t("admin.agencyStatus"), "Attempts", "Received", ""]}
          empty={billing.webhookEvents.length === 0}
        >
          {billing.webhookEvents.map((event) => (
            <tr key={event.id}>
              <td className="px-3 py-2 font-mono text-mono">{event.stripeEventId}</td>
              <td className="px-3 py-2">{event.type}</td>
              <td className="px-3 py-2">
                <AdminPill
                  tone={
                    event.status === "processed"
                      ? "good"
                      : event.status === "failed"
                        ? "bad"
                        : "neutral"
                  }
                >
                  {event.status}
                </AdminPill>
                {event.error ? (
                  <span className="mt-0.5 block max-w-md break-words text-caption text-danger">
                    {event.error}
                  </span>
                ) : null}
              </td>
              <td className="px-3 py-2 tabular-nums">{event.attempts}</td>
              <td className="px-3 py-2 whitespace-nowrap">
                {formatDateTime(event.createdAt, "UTC")}
              </td>
              <td className="px-3 py-2 text-right">
                {/*
                  ⚠️ REPLAY RE-RUNS OUR HANDLER OVER THE STORED PAYLOAD. It is
                  safe to press twice — every intent is an idempotent upsert —
                  which is why it needs no confirmation, unlike the queue's
                  drain.
                */}
                <form action={replayWebhookAction}>
                  <input
                    type="hidden"
                    name="stripeEventId"
                    value={event.stripeEventId}
                  />
                  <Button type="submit" variant="ghost" size="sm">
                    {t("admin.billingReplay")}
                  </Button>
                </form>
              </td>
            </tr>
          ))}
        </AdminTable>
      </AdminCard>

      <AdminCard title={t("admin.billingActive")}>
        <AdminTable
          columns={["Agency", t("admin.agencyPlan"), "Interval", t("admin.agencyStatus"), "Renews"]}
          empty={billing.subscriptions.length === 0}
        >
          {billing.subscriptions.map((subscription) => (
            <tr key={subscription.id}>
              <td className="px-3 py-2">{subscription.agency.name}</td>
              <td className="px-3 py-2">{subscription.plan.name}</td>
              <td className="px-3 py-2">{subscription.interval}</td>
              <td className="px-3 py-2">
                <AdminPill
                  tone={
                    subscription.status === "ACTIVE"
                      ? "good"
                      : subscription.status === "TRIALING"
                        ? "neutral"
                        : "bad"
                  }
                >
                  {subscription.status}
                </AdminPill>
              </td>
              <td className="px-3 py-2">
                {subscription.currentPeriodEnd
                  ? formatDateTime(subscription.currentPeriodEnd, "UTC")
                  : "—"}
              </td>
            </tr>
          ))}
        </AdminTable>
      </AdminCard>
    </AdminPage>
  );
}
