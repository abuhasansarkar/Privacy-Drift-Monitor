"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { MonitoringStatus } from "@pdm/schemas";
import { t } from "@pdm/shared/copy";
import { Button } from "@/components/ui/button";
import { AlertCircleIcon } from "@/components/ui/icons";
import { archiveWebsite, setWebsiteMonitoring } from "@/server/actions/websites";

/**
 * WEBSITE ACTIONS — §3.6.
 *
 * ⚠️ These buttons are NOT the authorization boundary. `<Can>` decides what to
 * render; the action re-checks the permission server-side, because a rendered
 * button is only a hint and an action is a public POST endpoint (§6.1).
 *
 * Archive asks for confirmation and says what it does and does not do —
 * archiving is reversible and keeps scan history, which is exactly the thing a
 * user is afraid of losing when they see the word.
 */
export function WebsiteActions({
  websiteId,
  monitoringStatus,
  canUpdate,
  canArchive,
}: {
  websiteId: string;
  monitoringStatus: MonitoringStatus;
  canUpdate: boolean;
  canArchive: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmingArchive, setConfirmingArchive] = useState(false);

  const paused = monitoringStatus === "PAUSED";

  function toggleMonitoring() {
    setError(null);
    startTransition(async () => {
      const outcome = await setWebsiteMonitoring({
        websiteId,
        action: paused ? "resume" : "pause",
      });
      if (!outcome.ok) setError(outcome.message);
      else router.refresh();
    });
  }

  function archive() {
    setError(null);
    startTransition(async () => {
      const outcome = await archiveWebsite({ websiteId });
      if (!outcome.ok) {
        setError(outcome.message);
        return;
      }
      router.push("/app/websites");
    });
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap gap-2">
        {canUpdate ? (
          <Button variant="secondary" onClick={toggleMonitoring} disabled={pending}>
            {paused ? t("websites.resume") : t("websites.pause")}
          </Button>
        ) : null}
        {canArchive ? (
          <Button
            variant="secondary"
            onClick={() => setConfirmingArchive(true)}
            disabled={pending}
          >
            {t("websites.archive")}
          </Button>
        ) : null}
      </div>

      {confirmingArchive ? (
        <div className="w-full max-w-sm rounded-md border border-border bg-card p-3 text-start">
          <p className="text-small font-semibold">{t("websites.archiveConfirmTitle")}</p>
          <p className="mt-1 text-small text-muted-foreground">
            {t("websites.archiveConfirmBody")}
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmingArchive(false)}
              disabled={pending}
            >
              {t("common.cancel")}
            </Button>
            <Button variant="primary" size="sm" onClick={archive} disabled={pending}>
              {pending ? t("websites.archiving") : t("websites.archive")}
            </Button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="flex items-start gap-2 text-small text-danger">
          <AlertCircleIcon className="mt-0.5" />
          {error}
        </p>
      ) : null}
    </div>
  );
}
