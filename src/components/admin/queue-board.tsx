"use client";

import { useState } from "react";
import { t } from "@pdm/shared/copy";
import { Button } from "@/components/ui/button";
import { AlertTriangleIcon } from "@/components/ui/icons";

/**
 * DESTRUCTIVE QUEUE ACTIONS — PLAN.md §3.12, feature doc 19.
 *
 * ⚠️ CONFIRM BY TYPING THE QUEUE NAME. "Drain" discards every waiting job —
 * scans a customer is waiting for, emails that will never be sent — and there
 * is no undo. A click-through confirmation is muscle memory after the third
 * time; typing `pdm-email` is not.
 *
 * ⚠️ THE SERVER CHECKS THE SAME STRING. This dialog is a speed bump only: the
 * action is reachable directly, so `drainQueueAction` compares `confirm`
 * against the queue name itself. See the note there.
 */
export function DangerousQueueAction({
  queue,
  label,
  warning,
  action,
}: {
  queue: string;
  label: string;
  warning: string;
  action: (formData: FormData) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");

  if (!open) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        {label}
      </Button>
    );
  }

  return (
    <form
      action={action}
      className="flex flex-col gap-2 rounded-md border border-danger/40 bg-danger-muted p-3"
    >
      <p className="flex items-start gap-2 text-caption text-danger">
        <AlertTriangleIcon className="mt-0.5 shrink-0" />
        {warning}
      </p>
      <input type="hidden" name="queue" value={queue} />
      <label className="text-caption text-muted-foreground">
        Type <span className="font-mono text-mono text-foreground">{queue}</span> to
        confirm
        <input
          name="confirm"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          className="mt-1 h-8 w-full rounded-md border border-border bg-background px-2 text-small"
          autoComplete="off"
        />
      </label>
      <div className="flex gap-2">
        <Button type="submit" variant="danger" size="sm" disabled={typed !== queue}>
          {label}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setOpen(false);
            setTyped("");
          }}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}

/** A plain submit button for the reversible actions (retry one, pause, resume). */
export function QueueActionButton({
  queue,
  jobId,
  label,
  action,
  variant = "secondary",
}: {
  queue: string;
  jobId?: string;
  label: string;
  action: (formData: FormData) => Promise<void>;
  variant?: "secondary" | "ghost" | "danger";
}) {
  return (
    <form action={action} className="inline">
      <input type="hidden" name="queue" value={queue} />
      {jobId ? <input type="hidden" name="jobId" value={jobId} /> : null}
      <Button type="submit" variant={variant} size="sm">
        {label}
      </Button>
    </form>
  );
}

/** Collapsible job payload. Long stack traces must not push the table off-screen. */
export function JobInspector({
  job,
}: {
  job: {
    id: string;
    name: string;
    attemptsMade: number;
    failedReason: string | null;
    stacktrace: string[];
    data: unknown;
  };
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="text-left font-mono text-mono text-primary underline underline-offset-2"
      >
        {job.id}
      </button>
      {open ? (
        <div className="flex flex-col gap-2 rounded-md border border-border bg-background p-2">
          <p className="text-caption text-muted-foreground">
            {t("admin.queueAttempts")}: {job.attemptsMade}
          </p>
          {job.failedReason ? (
            <p className="break-words text-caption text-danger">{job.failedReason}</p>
          ) : null}
          {/* Both scroll inside their own box — §11.5: the page body never
              scrolls sideways, and a stack trace is the widest thing here. */}
          <pre className="max-h-48 overflow-auto rounded bg-muted p-2 text-mono">
            {JSON.stringify(job.data, null, 2)}
          </pre>
          {job.stacktrace.length > 0 ? (
            <pre className="max-h-48 overflow-auto rounded bg-muted p-2 text-mono text-muted-foreground">
              {job.stacktrace.join("\n")}
            </pre>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
