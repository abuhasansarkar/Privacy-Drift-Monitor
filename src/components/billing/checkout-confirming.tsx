"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { t } from "@pdm/shared/copy";
import { Card } from "@/components/ui/card";
import { ClockIcon } from "@/components/ui/icons";

/**
 * THE POST-CHECKOUT WAITING STATE — §9.1, Phase 6 task 6.3.
 *
 * ⚠️ IT GRANTS NOTHING AND ASSERTS NOTHING. It polls `/api/v1/billing/confirmation`
 * until OUR projection — written only by the signature-verified webhook — says
 * the subscription is live, then refreshes the page so the plan card re-renders
 * from the server. `?checkout=success` in the address bar is not evidence, and
 * this component treats it as none.
 *
 * ⚠️ IT GIVES UP AFTER ~40 SECONDS RATHER THAN SPINNING FOREVER. Stripe
 * webhooks normally land in under two; a minute of silence means something is
 * wrong on our side or theirs, and a permanent spinner tells the customer
 * nothing while implying their money is in limbo. The give-up copy says the
 * payment went through — because it did — and that confirmation is pending.
 */

const INTERVAL_MS = 2_000;
const MAX_ATTEMPTS = 20;

export function CheckoutConfirming() {
  const router = useRouter();
  const [gaveUp, setGaveUp] = useState(false);

  useEffect(() => {
    let attempts = 0;
    let cancelled = false;

    const timer = setInterval(async () => {
      attempts += 1;
      if (attempts > MAX_ATTEMPTS) {
        clearInterval(timer);
        if (!cancelled) setGaveUp(true);
        return;
      }

      const response = await fetch("/api/v1/billing/confirmation").catch(() => null);
      if (!response?.ok) return;
      const data: unknown = await response.json().catch(() => null);
      if ((data as { confirmed?: unknown } | null)?.confirmed === true) {
        clearInterval(timer);
        if (!cancelled) {
          // `refresh()` re-runs the Server Component, so the plan card, the
          // meters and the banners all update from one round trip.
          router.refresh();
        }
      }
    }, INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [router]);

  return (
    <Card className="flex items-start gap-2.5 border-info/40 bg-info-muted p-4">
      <ClockIcon className="mt-0.5 text-info" />
      <div>
        <p className="text-small font-medium">{t("billing.confirming")}</p>
        <p className="text-small text-muted-foreground">
          {gaveUp ? t("billing.confirmingSlow") : t("billing.confirmingBody")}
        </p>
      </div>
    </Card>
  );
}
