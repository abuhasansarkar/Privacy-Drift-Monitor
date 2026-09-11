"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangleIcon } from "@/components/ui/icons";
import { t } from "@pdm/shared/copy";

export default function SharedReportError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("shared report error", error.digest);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="flex max-w-md gap-3 rounded-lg border border-border bg-card p-5 shadow-sm">
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
    </main>
  );
}
