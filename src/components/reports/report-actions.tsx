"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { t } from "@pdm/shared/copy";
import { Button } from "@/components/ui/button";
import {
  createReportShare,
  deleteReport,
  regenerateReport,
  revokeReportShare,
} from "@/server/actions/reports";

/**
 * REPORT DETAIL ACTIONS — §3.11, UI_DESIGN_PROMPTS §5.20.
 *
 * ⚠️ THE SHARE TOKEN IS SHOWN ONCE AND NEVER AGAIN. Only its hash is stored
 * (§6.10's rule applied to share links), so re-rendering the page cannot
 * recover it — the copy explicitly says so rather than leaving the user to
 * discover it after they close the panel.
 */
export function ReportActions({
  reportId,
  status,
  canShare,
  canDelete,
}: {
  reportId: string;
  status: string;
  canShare: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const shareUrl =
    token && typeof window !== "undefined"
      ? `${window.location.origin}/reports/shared/${token}`
      : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {status === "READY" ? (
          <a
            href={`/api/reports/${reportId}/download`}
            className="inline-flex h-9 items-center justify-center rounded-md border border-transparent bg-primary px-3.5 text-small font-medium text-primary-foreground hover:opacity-90 max-sm:h-11"
          >
            {t("reports.download")}
          </a>
        ) : null}

        <Button
          variant="secondary"
          disabled={pending || status === "GENERATING" || status === "QUEUED"}
          onClick={() =>
            start(async () => {
              setError(null);
              const result = await regenerateReport({ reportId });
              if (!result.ok) setError(result.message);
              router.refresh();
            })
          }
        >
          {t("reports.regenerate")}
        </Button>

        {canShare && status === "READY" ? (
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() =>
              start(async () => {
                setError(null);
                const result = await createReportShare({ reportId, expiresInDays: 7 });
                if (!result.ok) {
                  setError(result.message);
                  return;
                }
                setToken(result.data.token);
                router.refresh();
              })
            }
          >
            {t("reports.shareLink")}
          </Button>
        ) : null}

        {canDelete ? (
          <Button
            variant="ghost"
            disabled={pending}
            onClick={() => {
              if (!window.confirm(t("reports.deleteConfirm"))) return;
              start(async () => {
                const result = await deleteReport({ reportId });
                if (!result.ok) {
                  setError(result.message);
                  return;
                }
                router.push("/app/reports");
              });
            }}
          >
            {t("reports.deleteReport")}
          </Button>
        ) : null}
      </div>

      {shareUrl ? (
        <div className="rounded-md border border-border bg-muted/40 p-3">
          <p className="text-caption text-muted-foreground">{t("reports.shareCreated")}</p>
          <p className="mt-1 break-all font-mono text-mono">{shareUrl}</p>
          <p className="mt-1 text-caption text-muted-foreground">{t("reports.shareHelp")}</p>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-small text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function RevokeShareButton({
  reportId,
  shareId,
}: {
  reportId: string;
  shareId: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await revokeReportShare({ reportId, shareId });
          router.refresh();
        })
      }
    >
      {t("reports.shareRevoke")}
    </Button>
  );
}
