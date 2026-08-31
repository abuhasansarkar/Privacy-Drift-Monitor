import type { ReactNode } from "react";
import { t } from "@pdm/shared/copy";
import type { AIConfidence } from "@pdm/ai";
import { cn } from "@/lib/cn";
import {
  AlertTriangleIcon,
  SparkleIcon,
} from "@/components/ui/icons";

/**
 * AI OUTPUT CARD — PLAN.md Part VIII §8.8, Part XI §11.8, Phase 5 task 5.7.
 *
 * The single presentation every AI surface uses. Four §8.8 controls are built
 * into the frame rather than left to each caller, because a control that has to
 * be remembered per screen is a control that is missing on the fifth screen:
 *
 *   - **The persistent label.** "AI-generated from the evidence above", always
 *     rendered, never a tooltip and never dismissible. §8.8 lists opacity as a
 *     named risk; a reader must be able to tell at a glance which text on the
 *     page a model wrote.
 *   - **The evidence links.** §8.8 pairs the label with "a link to the raw
 *     evidence". The claim and the proof travel together or the claim is not
 *     shown.
 *   - **Confidence.** Required on every output; `low` renders an explicit
 *     "review the evidence directly" prompt rather than being quietly styled.
 *   - **The hypothesis block.** `is_hypothesis` renders in a visually distinct,
 *     labeled container — §8.8's mitigation for "fact vs. hypothesis blur".
 *
 * ⚠️ SEVERITY AND STATUS ARE NEVER COLOUR ALONE (§11.6, WCAG 1.4.1). Every
 * state below carries colour **plus** an icon **plus** text.
 *
 * ⚠️ A SERVER COMPONENT. It renders stored or freshly-returned output and holds
 * no state; the generate button and the feedback control are separate client
 * islands, so an issue page that already has an explanation ships no JS for it.
 */

const CONFIDENCE_LABEL: Record<AIConfidence, string> = {
  high: t("ai.confidenceHigh"),
  medium: t("ai.confidenceMedium"),
  low: t("ai.confidenceLow"),
};

const CONFIDENCE_TONE: Record<AIConfidence, string> = {
  high: "border-border text-muted-foreground",
  medium: "border-border text-muted-foreground",
  // `low` is the one that must catch the eye — it is the signal to go read the
  // evidence rather than trust the prose. `bg-warning-muted text-warning` is
  // the repo's warning pair (see `severity-badge.tsx`); `--warning-foreground`
  // is white in light mode and belongs only on a solid warning fill.
  low: "border-warning/40 bg-warning-muted text-warning",
};

export interface EvidenceLink {
  ref: string;
  label: string;
  href: string;
}

export function AiOutputCard({
  title,
  confidence,
  isHypothesis = false,
  fromCache = false,
  evidence,
  footer,
  children,
}: {
  title: string;
  confidence?: AIConfidence;
  isHypothesis?: boolean;
  fromCache?: boolean;
  /** The refs the output actually cited, resolved to links. */
  evidence?: readonly EvidenceLink[];
  /** The feedback island. */
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      className="rounded-lg border border-border bg-card"
      /* Announced as a region so a screen-reader user can tell where the
         machine-written content starts and ends — the aural equivalent of the
         visible label. */
      aria-label={`${title} — ${t("ai.label")}`}
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <h2 className="text-h4">{title}</h2>
        {confidence ? (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-caption font-medium",
              CONFIDENCE_TONE[confidence],
            )}
          >
            {CONFIDENCE_LABEL[confidence]}
          </span>
        ) : null}
        {fromCache ? (
          <span className="text-caption text-muted-foreground">
            {t("ai.fromCache")}
          </span>
        ) : null}
      </div>

      <div className="flex flex-col gap-4 px-4 py-4">
        {isHypothesis ? (
          <div className="flex gap-2.5 rounded-md border border-warning/40 bg-warning-muted p-3">
            <AlertTriangleIcon className="mt-0.5 text-warning" />
            <div>
              <p className="text-small font-semibold">{t("ai.hypothesis")}</p>
              <p className="text-small text-muted-foreground">
                {t("ai.hypothesisHint")}
              </p>
            </div>
          </div>
        ) : null}

        {children}

        {confidence === "low" ? (
          <p className="text-small text-muted-foreground">
            {t("ai.lowConfidenceHint")}
          </p>
        ) : null}

        {evidence && evidence.length > 0 ? (
          <div className="border-t border-border pt-3">
            <h3 className="text-caption font-semibold uppercase tracking-wide text-muted-foreground">
              {t("ai.evidenceUsed")}
            </h3>
            <ul className="mt-2 flex flex-col gap-1">
              {evidence.map((item) => (
                <li key={item.ref}>
                  <a
                    href={item.href}
                    className="font-mono text-caption text-primary underline-offset-2 hover:underline"
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      {/*
        ⚠️ THE LABEL SITS IN THE FRAME, NOT IN THE CONTENT. A caller cannot
        forget it, cannot style it away, and cannot render this card without it.
      */}
      <div className="flex flex-wrap items-center gap-2 border-t border-border bg-muted/40 px-4 py-2.5">
        <SparkleIcon className="text-muted-foreground" />
        <p className="text-caption text-muted-foreground">{t("ai.label")}</p>
        {footer ? <div className="ml-auto">{footer}</div> : null}
      </div>
    </section>
  );
}

/**
 * The state every AI section shows when there is no output — P3 made visible.
 *
 * ⚠️ IT SAYS WHAT IS STILL TRUE. §12.3's required wording ends "The technical
 * details above are complete", and that clause is the reason this component
 * exists instead of an error banner: the reader needs to know the page is not
 * missing anything they need. A generic failure state would make an additive
 * feature look like a broken one.
 */
export function AiUnavailable({
  title,
  message,
  action,
}: {
  title: string;
  message: string;
  action?: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-dashed border-border bg-card px-4 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <SparkleIcon className="text-muted-foreground" />
        <h2 className="text-h4">{title}</h2>
        {action ? <div className="ml-auto">{action}</div> : null}
      </div>
      <p className="mt-2 text-small text-muted-foreground">{message}</p>
    </section>
  );
}
