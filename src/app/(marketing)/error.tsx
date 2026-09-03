"use client";

import { useEffect } from "react";
import { t } from "@pdm/shared/copy";
import { Button } from "@/components/ui/button";
import { AlertTriangleIcon } from "@/components/ui/icons";

/**
 * ERROR BOUNDARY for the public site — §11.8.
 *
 * ⚠️ THIS IS THE FIRST PAGE A PROSPECT EVER SEES GO WRONG. Falling through to
 * `global-error.tsx` replaced the whole document, losing the header, the footer
 * and every route out — on the one surface whose entire job is to let a
 * stranger keep browsing. The boundary keeps the marketing chrome and offers a
 * way onward.
 *
 * ⚠️ IT DOES NOT SUPPRESS THE FAILURE. Most of these pages are statically
 * prerendered from constants in `content/`, so an error here means a genuine
 * defect rather than a transient read — `digest` is what ties this screen to
 * the server log line.
 */
export default function MarketingError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("marketing error boundary", error.digest);
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
