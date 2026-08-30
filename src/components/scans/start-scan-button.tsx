"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { t } from "@pdm/shared/copy";
import { Button } from "@/components/ui/button";
import { AlertCircleIcon } from "@/components/ui/icons";
import { startScan } from "@/server/actions/scans";

/**
 * "Scan now" — §3.6, §7.3.
 *
 * ⚠️ It navigates to the SCAN, not back to the website. The scan is queued, not
 * finished, and sending the user to a page that still shows the previous
 * scan's results would read as "nothing happened". The scan page shows QUEUED
 * and then progress.
 *
 * The already-running case comes back as a normal error message rather than an
 * exception: it is an expected outcome of double-clicking, and the user should
 * see one sentence, not an error boundary that replaces the page.
 */
export function StartScanButton({ websiteId }: { websiteId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run() {
    setError(null);
    start(async () => {
      const outcome = await startScan({ websiteId });
      if (!outcome.ok) {
        setError(outcome.message);
        return;
      }
      router.push(`/app/websites/${websiteId}/scans/${outcome.data.scanId}`);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <Button variant="primary" onClick={run} disabled={pending}>
        {pending ? t("scans.scanning") : t("scans.scanNow")}
      </Button>
      {error ? (
        <p role="alert" className="flex items-start gap-1.5 text-small text-danger">
          <AlertCircleIcon className="mt-0.5" />
          {error}
        </p>
      ) : null}
    </div>
  );
}
