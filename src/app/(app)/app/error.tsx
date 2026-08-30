"use client";

import { useEffect } from "react";
import { t } from "@pdm/shared/copy";
import { Button } from "@/components/ui/button";
import { AlertTriangleIcon } from "@/components/ui/icons";

/**
 * ERROR BOUNDARY for `/app` — §11.8.
 *
 * ⚠️ WHY THIS FILE HAS TO EXIST. Next renders a layout and its page
 * independently, so `(app)/app/layout.tsx` catching `NO_AGENCY` /
 * `NOT_A_MEMBER` does NOT stop the page from throwing the same error —
 * every page re-resolves context, exactly as §6.1 requires. Without a boundary
 * here the user gets a raw error overlay in dev and a blank frame in
 * production.
 *
 * ⚠️ The `message` is deliberately not rendered. React replaces a Server
 * Component error's message with a generic string in production, so showing it
 * would print one thing locally and another in production. `digest` is the
 * stable handle: it is what correlates this screen to the server log line, and
 * it is the only detail worth putting in front of the user.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // `instrumentation.ts`'s `onRequestError` already logged the server side.
    // This records that a user actually saw the failure, which the server log
    // cannot tell you on its own.
    console.error("app error boundary", error.digest);
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
          <Button variant="secondary" size="sm" onClick={reset} className="mt-3">
            {t("common.retry")}
          </Button>
        </div>
      </div>
    </div>
  );
}
