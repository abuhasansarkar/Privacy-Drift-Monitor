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
  canScan,
  clients,
  groups,
  children,
}: {
  /** Ids on the CURRENT page, in display order. */
  ids: string[];
  canUpdate: boolean;
  canArchive: boolean;
  /** "Scan now" is Developer+, a different gate from the rest (§3.5). */
  canScan: boolean;
  clients: readonly { id: string; name: string }[];
  groups: readonly { id: string; name: string }[];
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
  /** Which assignment panel is open, if either. */
  const [assigning, setAssigning] = useState<"client" | "group" | null>(null);
  const [groupChoice, setGroupChoice] = useState("");
  const [clientChoice, setClientChoice] = useState("");

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

  function run(
    action: "pause" | "resume" | "archive" | "scan" | "assignClient" | "assignGroup",
    extra: { clientId?: string | null; groupId?: string | null; groupName?: string } = {},
  ) {
    setError(null);
    setMessage(null);
    start(async () => {
      const outcome = await bulkWebsiteAction({
        websiteIds: [...selected],
        action,
        ...extra,
      });
      if (!outcome.ok) {
        setError(outcome.message);
        return;
      }
      // The skipped count is surfaced, not swallowed: a bulk pause that quietly
      // missed three sites leaves them scanning and nobody knows.
      // §3.5 asks for "12 of 15 queued" on a bulk scan, not a bare success.
      const verb = action === "scan" ? t("bulk.queued") : t("bulk.updated");
      setMessage(
        outcome.data.skipped > 0
          ? `${outcome.data.succeeded} ${verb} · ${outcome.data.skipped} ${t("bulk.skipped")}`
          : `${outcome.data.succeeded} ${verb}`,
      );
      setSelected(new Set());
      setConfirmingArchive(false);
      setAssigning(null);
      setGroupChoice("");
      setClientChoice("");
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
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={pending}
                  onClick={() => setAssigning(assigning === "client" ? null : "client")}
                >
                  {t("bulk.assignToClient")}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={pending}
                  onClick={() => setAssigning(assigning === "group" ? null : "group")}
                >
                  {t("bulk.moveToGroup")}
                </Button>
              </>
            ) : null}
            {canScan ? (
              <Button
                variant="secondary"
                size="sm"
                disabled={pending}
                onClick={() => run("scan")}
              >
                {t("bulk.scanNow")}
              </Button>
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

      {assigning === "client" ? (
        <div className="flex flex-wrap items-end gap-2 rounded-md border border-border bg-card p-3">
          <label className="min-w-[12rem] flex-1">
            <span className="mb-1 block text-caption font-medium text-muted-foreground">
              {t("bulk.assignToClient")}
            </span>
            <select
              value={clientChoice}
              onChange={(event) => setClientChoice(event.target.value)}
              className="h-9 w-full rounded-md border border-border bg-background px-2.5 text-small max-sm:h-11"
            >
              {/* An empty value CLEARS the assignment — "unassign" is a real
                  request, not an accident. */}
              <option value="">{t("websites.anyClient")}</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
          </label>
          <Button
            variant="primary"
            size="sm"
            disabled={pending}
            onClick={() => run("assignClient", { clientId: clientChoice || null })}
          >
            {t("bulk.apply")}
          </Button>
        </div>
      ) : null}

      {assigning === "group" ? (
        <div className="flex flex-wrap items-end gap-2 rounded-md border border-border bg-card p-3">
          <label className="min-w-[12rem] flex-1">
            <span className="mb-1 block text-caption font-medium text-muted-foreground">
              {t("bulk.moveToGroup")}
            </span>
            {/*
              One control for both "pick an existing group" and "create a new
              one": a datalist-backed text input. A separate "new group" flow
              would be a second screen for typing one word.
            */}
            <input
              list="pdm-website-groups"
              value={groupChoice}
              onChange={(event) => setGroupChoice(event.target.value)}
              placeholder={t("bulk.groupPlaceholder")}
              className="h-9 w-full rounded-md border border-border bg-background px-2.5 text-small max-sm:h-11"
            />
            <datalist id="pdm-website-groups">
              {groups.map((group) => (
                <option key={group.id} value={group.name} />
              ))}
            </datalist>
            <span className="mt-1 block text-caption text-muted-foreground">
              {t("bulk.newGroupHint")}
            </span>
          </label>
          <Button
            variant="primary"
            size="sm"
            disabled={pending}
            onClick={() => {
              const match = groups.find(
                (group) => group.name.toLowerCase() === groupChoice.trim().toLowerCase(),
              );
              run(
                "assignGroup",
                match
                  ? { groupId: match.id }
                  : groupChoice.trim()
                    ? { groupName: groupChoice.trim() }
                    : { groupId: null },
              );
            }}
          >
            {t("bulk.apply")}
          </Button>
        </div>
      ) : null}

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

      {children({
        selected,
        onToggle: toggle,
        label: t("bulk.selectRow"),
      })}
    </div>
  );
}
