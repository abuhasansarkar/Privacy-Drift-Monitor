"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { t } from "@pdm/shared/copy";
import { Button } from "@/components/ui/button";
import { AlertCircleIcon, CheckIcon } from "@/components/ui/icons";
import { bulkWebsiteAction } from "@/server/actions/website-bulk";

/**
 * BULK SELECTION — §3.6, UI_DESIGN_PROMPTS §5.2, Phase 1 task 1.6.
 *
 * ⚠️ SELECTION IS COMPONENT STATE, NOT URL STATE — the one exception to §3.6's
 * "filters live in the URL" rule, and deliberately. A filter describes what you
 * are looking at and is worth sharing; a selection is a half-finished action,
 * and a link that arrives with four rows pre-ticked invites someone to archive
 * a set they did not choose.
 *
 * ⚠️ THE SELECT-ALL CHECKBOX COVERS THE PAGE, NOT THE QUERY. "Select all 847
 * matching" is a different, much more dangerous operation than "select these
 * 25", and conflating them is how someone archives a portfolio. The count in
 * the bar always says exactly what will be acted on.
 */
export function BulkSelection({
  ids,
  canUpdate,
  canArchive,
  children,
}: {
  /** Ids on the CURRENT page, in display order. */
  ids: string[];
  canUpdate: boolean;
  canArchive: boolean;
  /** The table, given the selection state as a render prop. */
  children: (selection: {
    selected: ReadonlySet<string>;
    onToggle: (id: string) => void;
    label: string;
  }) => React.ReactNode;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmingArchive, setConfirmingArchive] = useState(false);

  const allSelected = ids.length > 0 && ids.every((id) => selected.has(id));

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(ids));
  }

  function run(action: "pause" | "resume" | "archive") {
    setError(null);
    setMessage(null);
    start(async () => {
      const outcome = await bulkWebsiteAction({
        websiteIds: [...selected],
        action,
      });
      if (!outcome.ok) {
        setError(outcome.message);
        return;
      }
      // The skipped count is surfaced, not swallowed: a bulk pause that quietly
      // missed three sites leaves them scanning and nobody knows.
      setMessage(
        outcome.data.skipped > 0
          ? `${outcome.data.succeeded} ${t("bulk.updated")} · ${outcome.data.skipped} ${t("bulk.skipped")}`
          : `${outcome.data.succeeded} ${t("bulk.updated")}`,
      );
      setSelected(new Set());
      setConfirmingArchive(false);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-3.5 py-2.5">
        <label className="flex items-center gap-2 text-small">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleAll}
            className="size-4 accent-primary"
          />
          {selected.size === 0
            ? t("bulk.selectPage")
            : `${selected.size} ${t("bulk.selected")}`}
        </label>

        {selected.size > 0 ? (
          <span className="flex flex-wrap gap-2">
            {canUpdate ? (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={pending}
                  onClick={() => run("pause")}
                >
                  {t("websites.pause")}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={pending}
                  onClick={() => run("resume")}
                >
                  {t("websites.resume")}
                </Button>
              </>
            ) : null}
            {canArchive ? (
              <Button
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => setConfirmingArchive(true)}
              >
                {t("websites.archive")}
              </Button>
            ) : null}
          </span>
        ) : null}

        {message ? (
          <span className="ms-auto flex items-center gap-1.5 text-small text-success">
            <CheckIcon className="size-3.5" />
            {message}
          </span>
        ) : null}
      </div>

      {children({ selected, onToggle: toggle, label: t("bulk.selected") })}

      {confirmingArchive ? (
        <div className="rounded-md border border-border bg-card p-3">
          <p className="text-small font-semibold">
            {t("bulk.archiveConfirm")} ({selected.size})
          </p>
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
            <Button
              variant="primary"
              size="sm"
              onClick={() => run("archive")}
              disabled={pending}
            >
              {t("websites.archive")}
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
