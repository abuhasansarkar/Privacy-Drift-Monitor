"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { t } from "@pdm/shared/copy";
import type {
  AIConfidence,
  FixRecommendation,
  IssueExplanation,
} from "@pdm/ai";
import { Button } from "@/components/ui/button";
import { SparkleIcon, ThumbDownIcon, ThumbUpIcon } from "@/components/ui/icons";
import {
  AiOutputCard,
  AiUnavailable,
  type EvidenceLink,
} from "@/components/ai/ai-output-card";
import { generateIssueOutput, submitAiFeedback } from "@/server/actions/ai";

/**
 * ISSUE DETAIL SECTIONS 7 AND 8 — PLAN.md §3.10 / UI_DESIGN_PROMPTS §5.13,
 * Part VIII §8.5, Phase 5 task 5.7.
 *
 * ⚠️ SECTION 2 ("Why this matters technically") IS NOT THIS. Feature doc 16's
 * trap list: that section is static rule-authored copy and "must read
 * identically every time". These two sections sit BELOW it and add to it. If
 * the model never answers, sections 1–6 are still a complete finding — which is
 * the whole of P3, expressed as page layout.
 *
 * ⚠️ GENERATION IS EXPLICIT, NEVER ON RENDER. §8.9's "on-demand by default" is
 * what "avoids paying to explain issues no one opens", and a component that
 * generated in an effect would defeat it while looking identical. The only
 * automatic path is `autoExplainCritical`, which is opt-in and runs in the
 * worker, not here.
 */

type IssueFeature = "EXPLAIN_ISSUE" | "RECOMMEND_FIX";

export interface StoredAiOutput {
  requestId: string;
  output: unknown;
  feedbackScore: number | null;
}

export function IssueExplanationSection({
  issueId,
  initial,
  canGenerate,
  evidenceLinks,
}: {
  issueId: string;
  initial: StoredAiOutput | null;
  canGenerate: boolean;
  evidenceLinks: readonly EvidenceLink[];
}) {
  return (
    <AiSection
      issueId={issueId}
      feature="EXPLAIN_ISSUE"
      title={t("ai.explanation")}
      generateLabel={t("ai.generate")}
      emptyMessage={t("ai.notGeneratedYet")}
      initial={initial}
      canGenerate={canGenerate}
      evidenceLinks={evidenceLinks}
      render={(output, refs) => <ExplanationBody value={output} refs={refs} />}
    />
  );
}

export function IssueFixSection({
  issueId,
  initial,
  canGenerate,
  evidenceLinks,
}: {
  issueId: string;
  initial: StoredAiOutput | null;
  canGenerate: boolean;
  evidenceLinks: readonly EvidenceLink[];
}) {
  return (
    <AiSection
      issueId={issueId}
      feature="RECOMMEND_FIX"
      title={t("ai.recommendedFix")}
      generateLabel={t("ai.generateFix")}
      /*
       * ⚠️ ITS OWN MESSAGE. Both cards used to share one string, so this card
       * — headed "Recommended fix" — told the reader "No AI EXPLANATION has
       * been generated for this yet", which is a sentence about the card
       * above it.
       */
      emptyMessage={t("ai.noFixYet")}
      initial={initial}
      canGenerate={canGenerate}
      evidenceLinks={evidenceLinks}
      render={(output, refs) => <FixBody value={output} refs={refs} />}
    />
  );
}

function AiSection({
  issueId,
  feature,
  title,
  generateLabel,
  emptyMessage,
  initial,
  canGenerate,
  evidenceLinks,
  render,
}: {
  issueId: string;
  feature: IssueFeature;
  title: string;
  generateLabel: string;
  /** What this specific card says when nothing has been generated. */
  emptyMessage: string;
  initial: StoredAiOutput | null;
  canGenerate: boolean;
  evidenceLinks: readonly EvidenceLink[];
  render: (
    output: Record<string, unknown>,
    refs: readonly EvidenceLink[],
  ) => React.ReactNode;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [current, setCurrent] = useState<StoredAiOutput | null>(initial);
  const [fromCache, setFromCache] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  function generate() {
    setFailure(null);
    start(async () => {
      const outcome = await generateIssueOutput({ issueId, feature });
      if (!outcome.ok) {
        /*
         * ⚠️ A FAILURE RENDERS INLINE AND CHANGES NOTHING ELSE. Quota, outage
         * and validation rejection all land here, each with its own sentence
         * from `aiMessageFor`. The sections above keep their deterministic
         * content, which was always complete on its own (P3).
         */
        setFailure(outcome.message);
        return;
      }
      setCurrent({
        requestId: outcome.data.requestId,
        output: outcome.data.output,
        feedbackScore: null,
      });
      setFromCache(outcome.data.fromCache);
      router.refresh();
    });
  }

  const generateButton = canGenerate ? (
    <Button variant="secondary" size="sm" onClick={generate} disabled={pending}>
      <SparkleIcon />
      {pending
        ? t("ai.generating")
        : current
          ? t("ai.regenerate")
          : generateLabel}
    </Button>
  ) : null;

  if (failure) {
    return <AiUnavailable title={title} message={failure} action={generateButton} />;
  }

  if (!current) {
    return (
      <AiUnavailable
        title={title}
        message={emptyMessage}
        action={generateButton}
      />
    );
  }

  const output = current.output as Record<string, unknown>;
  const cited = citedEvidence(output, evidenceLinks);

  return (
    <AiOutputCard
      title={title}
      confidence={confidenceOf(output)}
      isHypothesis={output.is_hypothesis === true}
      fromCache={fromCache}
      evidence={cited}
      footer={
        <div className="flex items-center gap-2">
          <AiFeedback
            requestId={current.requestId}
            initialScore={current.feedbackScore}
          />
          {generateButton}
        </div>
      }
    >
      {render(output, cited)}
    </AiOutputCard>
  );
}

function ExplanationBody({
  value,
}: {
  value: Record<string, unknown>;
  refs: readonly EvidenceLink[];
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-body">{String(value.summary ?? "")}</p>
      <Field label={t("issues.whyTechnical")}>
        {String(value.technical_reason ?? "")}
      </Field>
      <Field label={t("ai.explanation")}>{String(value.likely_cause ?? "")}</Field>
      <Field label={t("issues.recommendedAction")}>
        {String(value.recommended_action ?? "")}
      </Field>
    </div>
  );
}

function FixBody({ value }: { value: Record<string, unknown>; refs: readonly EvidenceLink[] }) {
  const steps = Array.isArray(value.steps)
    ? (value.steps as Array<{ order: number; action: string; where: string }>)
    : [];
  const verification = Array.isArray(value.verification_steps)
    ? (value.verification_steps as string[])
    : [];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-caption font-semibold uppercase tracking-wide text-muted-foreground">
          {t("ai.steps")}
        </h3>
        <ol className="mt-2 flex flex-col gap-2.5">
          {steps.map((step) => (
            <li key={step.order} className="flex gap-2.5">
              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border border-border text-caption tabular-nums">
                {step.order}
              </span>
              <span className="text-small">
                {step.action}
                {step.where ? (
                  <span className="block font-mono text-caption text-muted-foreground">
                    {step.where}
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ol>
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <Inline label={t("ai.affectedSystem")}>
          {String(value.affected_system ?? "")}
        </Inline>
        {/* ⚠️ §8.7: `risk` is the risk of APPLYING the fix, not the risk of the
            issue. The label says so, because the two are easy to confuse and
            confusing them makes a low-risk fix look like a low-risk problem. */}
        <Inline label={t("ai.fixRisk")}>{String(value.risk ?? "")}</Inline>
      </div>

      <div>
        <h3 className="text-caption font-semibold uppercase tracking-wide text-muted-foreground">
          {t("ai.verificationSteps")}
        </h3>
        <ul className="mt-2 flex list-disc flex-col gap-1 pl-5">
          {verification.map((step) => (
            <li key={step} className="text-small">
              {step}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-caption font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </h3>
      <p className="mt-1 text-small text-muted-foreground">{children}</p>
    </div>
  );
}

function Inline({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <p className="text-caption">
      <span className="text-muted-foreground">{label}: </span>
      <span className="font-medium">{children}</span>
    </p>
  );
}

/**
 * §8.8's feedback loop — thumbs up/down → `AIRequest.feedbackScore` → the
 * per-prompt-version acceptance rate in admin.
 *
 * ⚠️ THE VOTE IS OPTIMISTIC AND ITS FAILURE IS SILENT. Rating is a courtesy the
 * reader is doing us; an error toast for a lost thumbs-down would spend their
 * attention on our telemetry problem. The score is not part of the finding.
 */
function AiFeedback({
  requestId,
  initialScore,
}: {
  requestId: string;
  initialScore: number | null;
}) {
  const [score, setScore] = useState<number | null>(initialScore);
  const [, start] = useTransition();

  function vote(next: 1 | -1) {
    const applied = score === next ? 0 : next;
    setScore(applied);
    start(async () => {
      await submitAiFeedback({ requestId, score: applied as -1 | 0 | 1 });
    });
  }

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="sm"
        aria-label={t("ai.helpful")}
        aria-pressed={score === 1}
        onClick={() => vote(1)}
        className={score === 1 ? "text-success" : undefined}
      >
        <ThumbUpIcon />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        aria-label={t("ai.notHelpful")}
        aria-pressed={score === -1}
        onClick={() => vote(-1)}
        className={score === -1 ? "text-danger" : undefined}
      >
        <ThumbDownIcon />
      </Button>
    </div>
  );
}

function confidenceOf(output: Record<string, unknown>): AIConfidence | undefined {
  const value = output.confidence;
  return value === "high" || value === "medium" || value === "low"
    ? value
    : undefined;
}

/**
 * Resolves the refs an output CITED to their links.
 *
 * ⚠️ FILTERED TO WHAT WAS CITED, not "all the evidence on the issue". §8.8
 * pairs the AI label with a link to the evidence it used, and listing rows the
 * model never referenced would misrepresent which facts the text rests on —
 * the opposite of what the link is for. The server already proved every ref
 * here resolves; this is presentation, not a second grounding check.
 */
function citedEvidence(
  output: Record<string, unknown>,
  links: readonly EvidenceLink[],
): EvidenceLink[] {
  const refs = Array.isArray(output.evidence_refs)
    ? (output.evidence_refs as unknown[]).filter(
        (ref): ref is string => typeof ref === "string",
      )
    : [];
  const byRef = new Map(links.map((link) => [link.ref, link]));
  return refs
    .map((ref) => byRef.get(ref))
    .filter((link): link is EvidenceLink => link !== undefined);
}

export type { IssueExplanation, FixRecommendation };
