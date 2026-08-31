"use client";

import { useState, useTransition } from "react";
import { t } from "@pdm/shared/copy";
import type { AIConfidence } from "@pdm/ai";
import { Button } from "@/components/ui/button";
import { SparkleIcon } from "@/components/ui/icons";
import { AiOutputCard, AiUnavailable } from "@/components/ai/ai-output-card";
import { generateDriftSummary } from "@/server/actions/ai";
import type { StoredAiOutput } from "@/components/ai/issue-ai-sections";

/**
 * DRIFT SUMMARY — PLAN.md Part VIII §8.5 feature 3, Phase 5 task 5.7.
 *
 * "What changed this week?" in one paragraph, at the head of the Changes tab.
 *
 * ⚠️ IT SITS ABOVE THE EVENT LIST AND REPLACES NOTHING. §8.5's fallback for
 * this feature is "the structured event list renders alone" — so the list below
 * is always the authority, and this is a reading aid over the top of it. A
 * summary that hid the events it summarised would put a model between the user
 * and the facts, which is P1 inverted.
 *
 * ⚠️ NO EVENTS MEANS NO BUTTON. The server refuses to call a provider with an
 * empty event set (`events_referenced` is `.min(1)`, so the response could only
 * fail validation), and the tab already renders its own empty state — offering
 * a button that cannot succeed is worse than offering none.
 */
export function DriftSummarySection({
  websiteId,
  initial,
  canGenerate,
  hasEvents,
}: {
  websiteId: string;
  initial: StoredAiOutput | null;
  canGenerate: boolean;
  hasEvents: boolean;
}) {
  const [pending, start] = useTransition();
  const [current, setCurrent] = useState<StoredAiOutput | null>(initial);
  const [fromCache, setFromCache] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  if (!hasEvents) return null;

  function generate() {
    setFailure(null);
    start(async () => {
      const outcome = await generateDriftSummary({ websiteId, days: 7 });
      if (!outcome.ok) {
        setFailure(outcome.message);
        return;
      }
      setCurrent({
        requestId: outcome.data.requestId,
        output: outcome.data.output,
        feedbackScore: null,
      });
      setFromCache(outcome.data.fromCache);
    });
  }

  const button = canGenerate ? (
    <Button variant="secondary" size="sm" onClick={generate} disabled={pending}>
      <SparkleIcon />
      {pending
        ? t("ai.generating")
        : current
          ? t("ai.regenerate")
          : t("ai.generateSummary")}
    </Button>
  ) : null;

  if (failure) {
    return (
      <AiUnavailable title={t("ai.driftSummary")} message={failure} action={button} />
    );
  }

  if (!current) {
    // ⚠️ A Viewer with no `ai:generate` and no stored summary gets NOTHING here,
    // not an empty card with a disabled button. The event list below is the
    // content; an inert affordance would only advertise a permission they do
    // not have.
    if (!canGenerate) return null;
    return (
      <AiUnavailable
        title={t("ai.driftSummary")}
        message={t("ai.notGeneratedYet")}
        action={button}
      />
    );
  }

  const output = current.output as Record<string, unknown>;
  const confidence =
    output.confidence === "high" ||
    output.confidence === "medium" ||
    output.confidence === "low"
      ? (output.confidence as AIConfidence)
      : undefined;

  return (
    <AiOutputCard
      title={t("ai.driftSummary")}
      confidence={confidence}
      fromCache={fromCache}
      footer={button}
    >
      <div className="flex flex-col gap-3">
        <p className="text-body font-medium">{String(output.headline ?? "")}</p>
        <p className="text-small text-muted-foreground">
          {String(output.narrative ?? "")}
        </p>
        {output.most_significant_change ? (
          <div>
            <h3 className="text-caption font-semibold uppercase tracking-wide text-muted-foreground">
              {t("ai.driftSummary")}
            </h3>
            <p className="mt-1 text-small">
              {String(output.most_significant_change)}
            </p>
          </div>
        ) : null}
      </div>
    </AiOutputCard>
  );
}
