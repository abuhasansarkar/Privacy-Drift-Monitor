"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { IssueStatus } from "@pdm/schemas";
import { t } from "@pdm/shared/copy";
import { Button } from "@/components/ui/button";
import { AlertCircleIcon } from "@/components/ui/icons";
import { ignoreIssue, setIssueStatus } from "@/server/actions/issues";

/**
 * ISSUE ACTIONS — §5.13.
 *
 * ⚠️ IGNORING REQUIRES A TYPED REASON, and the button stays disabled until one
 * is written. That is not friction for its own sake: the suppression outlives
 * whoever applied it, and six months later someone else has to understand why
 * this site stopped reporting a finding. The server enforces the same minimum —
 * this only makes the requirement visible before the click.
 *
 * `<Can>` decides what renders; the action re-checks the permission server-side
 * (§6.1). A rendered button is a hint, never the gate.
 */
export function IssueActions({
  issueId,
  status,
  canTransition,
  canIgnore,
}: {
  issueId: string;
  status: IssueStatus;
  canTransition: boolean;
  canIgnore: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");

  const closed = status === "RESOLVED" || status === "VERIFIED";
  const acknowledged = status !== "NEW" && status !== "REOPENED";

  function transition(next: "ACKNOWLEDGED" | "RESOLVED") {
    setError(null);
    start(async () => {
      const outcome = await setIssueStatus({ issueId, status: next });
      if (!outcome.ok) setError(outcome.message);
      else router.refresh();
    });
  }

  function ignore() {
    setError(null);
    start(async () => {
      const outcome = await ignoreIssue({ issueId, reason: reason.trim() });
      if (!outcome.ok) {
        setError(outcome.message);
        return;
      }
      setConfirming(false);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap gap-2">
        {canTransition && !acknowledged ? (
          <Button
            variant="secondary"
            onClick={() => transition("ACKNOWLEDGED")}
            disabled={pending}
          >
            {t("issues.acknowledge")}
          </Button>
        ) : null}
        {canTransition && !closed ? (
          <Button
            variant="primary"
            onClick={() => transition("RESOLVED")}
            disabled={pending}
          >
            {t("issues.resolve")}
          </Button>
        ) : null}
        {canIgnore && status !== "IGNORED" ? (
          <Button
            variant="ghost"
            onClick={() => setConfirming(true)}
            disabled={pending}
          >
            {t("issues.ignore")}
          </Button>
        ) : null}
      </div>

      {confirming ? (
        <div className="w-full max-w-sm rounded-md border border-border bg-card p-3 text-start">
          <p className="text-small font-semibold">{t("issues.ignoreTitle")}</p>
          <p className="mt-1 text-small text-muted-foreground">
            {t("issues.ignoreBody")}
          </p>
          <label className="mt-3 flex flex-col gap-1.5">
            <span className="text-caption font-semibold">
              {t("issues.reasonLabel")}
            </span>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              maxLength={500}
              placeholder={t("issues.reasonPlaceholder")}
              className="rounded-md border border-border bg-background px-3 py-2 text-small outline-none placeholder:text-muted-foreground"
            />
          </label>
          <div className="mt-3 flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirming(false)}
              disabled={pending}
            >
              {t("common.cancel")}
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={ignore}
              // Mirrors the schema's `min(10)`. The server is the real check.
              disabled={pending || reason.trim().length < 10}
            >
              {pending ? t("issues.ignoring") : t("issues.ignore")}
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

/**
 * A compact "Acknowledge" for a dense row — the Attention Center's second action.
 *
 * ⚠️ ACKNOWLEDGE, NOT RESOLVE. Acknowledging says "I have seen this"; resolving
 * claims it is fixed and triggers a verification re-scan (§6.5). Offering the
 * stronger one from a dashboard row, one click away, is how issues get closed
 * without anyone having looked at them.
 */
export function AcknowledgeIssueButton({ issueId }: { issueId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);

  return (
    <button
      type="button"
      disabled={pending || done}
      onClick={() =>
        start(async () => {
          const outcome = await setIssueStatus({ issueId, status: "ACKNOWLEDGED" });
          if (outcome.ok) {
            setDone(true);
            router.refresh();
          }
        })
      }
      className="rounded-md px-2 py-1 text-caption text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
    >
      {done ? t("issueStatus.acknowledged") : t("dashboard.actionAcknowledge")}
    </button>
  );
}
