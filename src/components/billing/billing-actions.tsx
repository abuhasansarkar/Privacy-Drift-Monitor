"use client";

import { useState, useTransition } from "react";
import { t } from "@pdm/shared/copy";
import { Button } from "@/components/ui/button";

/**
 * CHECKOUT AND PORTAL BUTTONS — §9.1, Phase 6 task 6.3.
 *
 * ⚠️ A CLIENT COMPONENT THAT `fetch`ES A ROUTE, NOT A SERVER ACTION. Both
 * endpoints return a Stripe-hosted URL the BROWSER must navigate to. A Server
 * Action's return value is consumed by React, so the navigation would have to
 * be re-issued on the client anyway — and `redirect()` to an external origin
 * from an action is a different, worse spelling of the same thing.
 *
 * ⚠️ `window.location.assign`, NOT `router.push`. The target is Stripe's
 * origin; the App Router would try to treat it as an internal route.
 */

async function openStripe(
  endpoint: string,
  body: Record<string, unknown> | null,
): Promise<string | null> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => null);
    console.error(`Billing action failed on ${endpoint}:`, response.status, err);
    return null;
  }
  const data: unknown = await response.json().catch(() => null);
  const url = (data as { url?: unknown } | null)?.url;
  return typeof url === "string" ? url : null;
}

export function PortalButton({
  variant = "secondary",
  label,
}: {
  variant?: "primary" | "secondary";
  label?: string;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        variant={variant}
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const url = await openStripe("/api/billing/portal", null);
            if (url) window.location.assign(url);
            else setError(t("billing.portalFailed"));
          })
        }
      >
        {label ?? t("billing.manageBilling")}
      </Button>
      {error ? (
        <p role="status" className="text-caption text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function CheckoutButton({
  planKey,
  interval,
  currency,
  label,
  variant = "primary",
}: {
  planKey: string;
  interval: "MONTHLY" | "ANNUAL";
  currency: string;
  label: string;
  variant?: "primary" | "secondary";
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-stretch gap-1">
      <Button
        variant={variant}
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const url = await openStripe("/api/billing/checkout", {
              planKey,
              interval,
              currency,
            });
            if (url) window.location.assign(url);
            else setError(t("billing.checkoutFailed"));
          })
        }
      >
        {label}
      </Button>
      {error ? (
        <p role="status" className="text-caption text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
