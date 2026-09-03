"use client";

import { useEffect } from "react";
import { t } from "@pdm/shared/copy";
import { Button } from "@/components/ui/button";
import { AlertTriangleIcon } from "@/components/ui/icons";

/**
 * ERROR BOUNDARY for the client portal — §11.8, §6.10.
 *
 * ⚠️ THE AUDIENCE HERE IS THE AGENCY'S CLIENT, NOT THE AGENCY. A portal visitor
 * is a non-technical contact who arrived from an email link; before this file
 * existed they fell through to `global-error.tsx`, which replaces the whole
 * document with an unbranded crash screen. That screen is the agency's brand
 * failing in front of their customer.
 *
 * ⚠️ NO RETRY-TO-SIGN-IN GUESSWORK. A portal session can be expired, revoked or
 * simply absent, and this boundary cannot tell which. It offers a retry and a
 * route back to sign-in; deciding the reason belongs to `session.ts`, which
 * answers 401 and lets the route redirect.
 */
export default function PortalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("portal error boundary", error.digest);
  }, [error]);

  return (
    <div className="flex min-h-[60svh] items-center justify-center px-4">
      <div className="flex max-w-md gap-3 rounded-lg border border-border bg-card p-5">
        <AlertTriangleIcon className="mt-0.5 shrink-0 text-warning" />
        <div className="min-w-0">
          <h1 className="text-h4">{t("error.generic")}</h1>
          {error.digest ? (
            <p className="mt-1 font-mono text-caption break-all text-muted-foreground">
              {t("error.referenceLabel")}: {error.digest}
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={reset}>
              {t("common.retry")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
