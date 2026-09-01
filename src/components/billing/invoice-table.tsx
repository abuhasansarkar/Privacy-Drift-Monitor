import { t } from "@pdm/shared/copy";
import { Card, CardHeader } from "@/components/ui/card";
import { AlertTriangleIcon } from "@/components/ui/icons";
import { formatDate, formatMoney } from "@/lib/format";
import type { StripeSideData } from "@/server/services/billing";

/**
 * INVOICE HISTORY, PAYMENT METHOD, BILLING EMAIL, TAX ID — §3.11, task 6.3.
 *
 * ⚠️ EVERY LINK LEAVES FOR STRIPE. §9.1: "we do not rebuild those flows". The
 * PDF, the hosted invoice page and any correction to a tax id are Stripe's, and
 * re-rendering an invoice ourselves would mean maintaining a document that has
 * to agree exactly with the one the tax authority sees.
 *
 * ⚠️ `available: false` IS A NOTICE, NOT AN EMPTY STATE. "No invoices yet" and
 * "we could not reach the payment provider" look identical if both render as an
 * empty table, and only one of them means the customer should do nothing.
 */
export function InvoiceTable({
  stripe,
  timeZone,
}: {
  stripe: StripeSideData;
  timeZone: string;
}) {
  return (
    <Card>
      <CardHeader title={t("billing.invoicesTitle")} />

      <dl className="grid gap-4 border-b border-border p-4 sm:grid-cols-3">
        <div>
          <dt className="text-caption text-muted-foreground">
            {t("billing.paymentMethodTitle")}
          </dt>
          <dd className="text-small">
            {stripe.paymentMethod ? (
              <>
                <span className="capitalize">{stripe.paymentMethod.brand}</span>{" "}
                {t("billing.cardEnding")} {stripe.paymentMethod.last4}
                <span className="block text-caption text-muted-foreground">
                  {t("billing.cardExpires")}{" "}
                  {String(stripe.paymentMethod.expMonth).padStart(2, "0")}/
                  {stripe.paymentMethod.expYear}
                </span>
              </>
            ) : (
              <span className="text-muted-foreground">
                {t("billing.noPaymentMethod")}
              </span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-caption text-muted-foreground">
            {t("billing.billingEmail")}
          </dt>
          <dd className="text-small break-words">
            {stripe.billingEmail ?? (
              <span className="text-muted-foreground">
                {t("billing.billingEmailNone")}
              </span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-caption text-muted-foreground">
            {t("billing.taxIdTitle")}
          </dt>
          <dd className="text-small break-words">
            {stripe.taxIds.length > 0 ? (
              stripe.taxIds.join(", ")
            ) : (
              <span className="text-muted-foreground">{t("billing.taxIdNone")}</span>
            )}
          </dd>
        </div>
      </dl>

      {!stripe.available ? (
        <p className="flex items-start gap-2 p-4 text-small text-muted-foreground">
          <AlertTriangleIcon className="mt-0.5 text-warning" />
          {t("billing.invoicesUnavailable")}
        </p>
      ) : stripe.invoices.length === 0 ? (
        <p className="p-4 text-small text-muted-foreground">
          {t("billing.invoicesEmpty")}
        </p>
      ) : (
        /* The table scrolls inside its own container — the page body never
           scrolls sideways (§11.5). */
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] text-small">
            <thead>
              <tr className="border-b border-border text-left text-caption text-muted-foreground">
                <th scope="col" className="px-4 py-2 font-medium">
                  {t("billing.invoiceNumber")}
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  {t("billing.invoiceDate")}
                </th>
                <th scope="col" className="px-4 py-2 text-right font-medium">
                  {t("billing.invoiceAmount")}
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  {t("billing.invoiceStatus")}
                </th>
                <th scope="col" className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {stripe.invoices.map((invoice) => (
                <tr key={invoice.id}>
                  <td className="px-4 py-2.5 tabular-nums">{invoice.number ?? "—"}</td>
                  <td className="px-4 py-2.5">
                    {formatDate(invoice.createdAt, timeZone)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {formatMoney(invoice.amountPaidCents, invoice.currency)}
                  </td>
                  <td className="px-4 py-2.5 capitalize">{invoice.status}</td>
                  <td className="px-4 py-2.5 text-right">
                    {invoice.hostedUrl ? (
                      <a
                        className="text-primary underline underline-offset-2"
                        href={invoice.hostedUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                      >
                        {t("billing.invoiceView")}
                      </a>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
