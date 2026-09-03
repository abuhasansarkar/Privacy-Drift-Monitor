"use client";

import { useEffect } from "react";
import { t } from "@pdm/shared/copy";
import { Button } from "@/components/ui/button";
import { AlertTriangleIcon } from "@/components/ui/icons";

/**
 * ERROR BOUNDARY for `/admin` — §11.8.
 *
 * ⚠️ THE ADMIN SURFACE THREW STRAIGHT THROUGH TO `global-error.tsx` BEFORE
 * THIS FILE. That boundary replaces the entire document, so a super admin whose
 * query failed on one page lost the whole shell — no nav, no way back except
 * the browser's own controls — for what is usually one bad filter.
 *
 * ⚠️ NOTHING ABOUT THE ERROR IS RENDERED EXCEPT `digest`. Admin pages read
 * across tenants, so an error message here can carry another agency's data in
 * a stack frame or a Prisma error string. `digest` correlates to the server log
 * without putting any of it on screen.
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("admin error boundary", error.digest);
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
