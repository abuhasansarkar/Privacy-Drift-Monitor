"use client";

import { useState, useTransition } from "react";
import { t } from "@pdm/shared/copy";
import { Button } from "@/components/ui/button";
import { CopyIcon, SparkleIcon, XIcon } from "@/components/ui/icons";
import { generateClientMessage } from "@/server/actions/ai";

/**
 * CLIENT MESSAGE DIALOG — PLAN.md Part VIII §8.5 feature 4, Phase 5 task 5.7.
 *
 * Turns Persona B's 30-minute writing task into two minutes (JTBD J4).
 *
 * ⚠️ IT PRODUCES A DRAFT AND SENDS NOTHING. Feature doc 16: "Client messages
 * are drafts requiring human edit." There is deliberately no send button and no
 * path from this component to `@pdm/email` — the output most likely to reach a
 * third party is the one that must pass a human first, and the only way to make
 * that structural is to not build the send.
 *
 * The subject and body land in EDITABLE fields, not in a read-only preview: an
 * agency putting its own name on a message should be able to change a sentence
 * without copying it somewhere else first, and a draft you cannot edit is one
 * people paste unread.
 *
 * ⚠️ TONE IS A RADIO GROUP, NEVER A TEXT INPUT. §8.8 ("prompt injection via
 * user input"): user-supplied free text is enum-constrained or excluded from
 * prompts. The server re-validates the same enum — this only makes the
 * constraint visible.
 */

const TONES = [
  { value: "reassuring", label: t("ai.toneReassuring") },
  { value: "factual", label: t("ai.toneFactual") },
  { value: "urgent", label: t("ai.toneUrgent") },
] as const;

type Tone = (typeof TONES)[number]["value"];

export function ClientMessageDialog({
  websiteId,
  issueIds,
  onClose,
}: {
  websiteId: string;
  issueIds: string[];
  onClose: () => void;
}) {
  const [pending, start] = useTransition();
  const [tone, setTone] = useState<Tone>("factual");
  const [fixInProgress, setFixInProgress] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [generated, setGenerated] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function generate() {
    setFailure(null);
    start(async () => {
      const outcome = await generateClientMessage({
        websiteId,
        issueIds,
        tone,
        fixInProgress,
      });
      if (!outcome.ok) {
        setFailure(outcome.message);
        return;
      }
      const output = outcome.data.output as { subject?: string; body?: string };
      setSubject(output.subject ?? "");
      setBody(output.body ?? "");
      setGenerated(true);
    });
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(`${subject}\n\n${body}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be denied (insecure context, permissions policy).
      // The text is already selectable in the textarea, so there is nothing to
      // recover — an error banner here would be noise about a working fallback.
    }
  }

  /*
   * ⚠️ A `mailto:` HANDOFF, NOT A SEND. It opens the user's own client with the
   * draft prefilled, so the message leaves from their address, under their eye,
   * after they have read it. `encodeURIComponent` is required, not defensive:
   * an unencoded `&` in the body silently truncates the message at that
   * character, which the sender would not notice until the client replied.
   */
  const mailto = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("ai.clientMessage")}
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4"
    >
      <div className="flex max-h-full w-full max-w-2xl flex-col overflow-auto rounded-lg border border-border bg-card">
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <SparkleIcon className="text-muted-foreground" />
          <h2 className="text-h4">{t("ai.clientMessage")}</h2>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            aria-label={t("common.close")}
            onClick={onClose}
          >
            <XIcon />
          </Button>
        </div>

        <div className="flex flex-col gap-4 px-4 py-4">
          <fieldset>
            <legend className="text-caption font-semibold uppercase tracking-wide text-muted-foreground">
              {t("ai.tone")}
            </legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {TONES.map((option) => (
                <label
                  key={option.value}
                  className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-small has-checked:border-primary has-checked:bg-muted"
                >
                  <input
                    type="radio"
                    name="tone"
                    value={option.value}
                    checked={tone === option.value}
                    onChange={() => setTone(option.value)}
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </fieldset>

          <label className="inline-flex items-center gap-2 text-small">
            <input
              type="checkbox"
              checked={fixInProgress}
              onChange={(event) => setFixInProgress(event.target.checked)}
            />
            {t("ai.fixInProgress")}
          </label>

          <div>
            <Button variant="primary" onClick={generate} disabled={pending}>
              <SparkleIcon />
              {pending
                ? t("ai.generating")
                : generated
                  ? t("ai.regenerate")
                  : t("ai.clientMessage")}
            </Button>
          </div>

          {failure ? (
            <p className="rounded-md border border-dashed border-border px-3 py-2 text-small text-muted-foreground">
              {failure}
            </p>
          ) : null}

          {generated ? (
            <>
              {/*
                ⚠️ THE DRAFT NOTICE IS ABOVE THE FIELDS, NOT BELOW THEM. Someone
                who scrolls to the body, copies it and leaves must have already
                passed the sentence saying nothing is sent from here.
              */}
              <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-small text-muted-foreground">
                {t("ai.draftNotice")}
              </p>

              <label className="flex flex-col gap-1.5">
                <span className="text-caption font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("ai.subject")}
                </span>
                <input
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                  className="h-9 rounded-md border border-input bg-background px-3 text-small"
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-caption font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("ai.body")}
                </span>
                <textarea
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  rows={14}
                  className="rounded-md border border-input bg-background px-3 py-2 text-small"
                />
              </label>

              <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
                <SparkleIcon className="text-muted-foreground" />
                <p className="text-caption text-muted-foreground">{t("ai.label")}</p>
                <div className="ml-auto flex gap-2">
                  <Button variant="secondary" size="sm" onClick={copy}>
                    <CopyIcon />
                    {copied ? t("ai.copied") : t("ai.copyDraft")}
                  </Button>
                  <a
                    href={mailto}
                    className="inline-flex h-8 items-center rounded-md border border-border px-2.5 text-caption font-medium hover:bg-muted max-sm:h-11"
                  >
                    {t("ai.openInEmail")}
                  </a>
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
