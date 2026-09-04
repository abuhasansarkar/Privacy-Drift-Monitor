"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { t } from "@pdm/shared/copy";
import { cn } from "@/lib/cn";
import { formatDuration, formatNumber } from "@/lib/format";
import { CheckIcon, ClockIcon } from "@/components/ui/icons";

/**
 * SCAN PROGRESS — §3.9, Phase 2 task 2.16.
 *
 * An honest pipeline: what finished, what is running, what has not started.
 * Counts appear per journey only once that journey has completed — a running
 * stage shows no totals, because a partial count read as a final one is a
 * fact the scanner has not established yet (P1).
 *
 * ⚠️ TWO SIGNALS, AND THEY MEAN DIFFERENT THINGS. The bar's WIDTH is reported
 * progress: it only moves when the scanner finishes or starts a journey. The
 * SHIMMER over it is liveness: it runs continuously while the job is in flight.
 * A scan can sit at one width for half a minute during a slow journey, and
 * without the second signal that is indistinguishable from a hung worker — which
 * is precisely how a real scan stuck at "0% · 42 s elapsed" was read.
 *
 * ⚠️ THE STALL HINT IS A FACT ABOUT ELAPSED TIME, NOT A DIAGNOSIS. It says the
 * scan is taking longer than most, because that is all this component knows. It
 * does not claim the job is stuck: only the worker can establish that, and a UI
 * that guesses at backend state is the same error class as a rule inventing a
 * finding.
 */

export interface ProgressStage {
  id: string;
  title: string;
  detail: string;
  state: "done" | "running" | "waiting";
}

/**
 * Past this, a scan is unusual rather than merely slow.
 *
 * Four journeys at a ~30s budget each plus browser startup puts a healthy scan
 * comfortably under two minutes; the reclaim sweep that marks a scan
 * `SCAN_TIMEOUT` does not run for thirty. This sits between the two so the
 * reader is told something is wrong long before the backend admits it.
 */
const SLOW_AFTER_SECONDS = 150;

export function ScanProgress({
  stages,
  percent,
  elapsedSeconds,
  currentLabel,
}: {
  stages: ProgressStage[];
  percent: number;
  elapsedSeconds: number;
  currentLabel: string;
}) {
  const reduced = useReducedMotion();
  const active = stages.some((stage) => stage.state === "running");
  const slow = active && elapsedSeconds >= SLOW_AFTER_SECONDS;
  const width = Math.min(100, Math.max(0, percent));

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="mb-2 flex flex-wrap justify-between gap-2 text-caption text-muted-foreground">
          {/*
            ⚠️ `aria-live="polite"` — §11.6 requires the running scan to
            ANNOUNCE itself. A sighted reader watches the bar move; without this
            a screen-reader user gets one reading at mount and silence for the
            rest of the scan. `polite` rather than `assertive`: finishing a
            journey is worth saying, never worth interrupting.
          */}
          <span aria-live="polite" aria-atomic="true">
            {currentLabel}
          </span>
          <span className="tabular-nums">
            {formatNumber(percent)}% · {formatDuration(elapsedSeconds)}{" "}
            {t("scan.elapsed")}
          </span>
        </div>
        <div
          className="h-1.5 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={currentLabel}
        >
          {reduced ? (
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${width}%` }}
            />
          ) : (
            <motion.div
              className={cn(
                "h-full rounded-full bg-primary",
                // Liveness, not amount — see the header note.
                active && "animate-shimmer",
              )}
              initial={false}
              animate={{ width: `${width}%` }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            />
          )}
        </div>

        <AnimatePresence initial={false}>
          {slow ? (
            <motion.p
              key="slow"
              initial={reduced ? false : { opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={reduced ? undefined : { opacity: 0, height: 0 }}
              transition={{ duration: 0.25 }}
              className="mt-2 overflow-hidden text-caption text-muted-foreground"
            >
              {t("scans.takingLonger")}
            </motion.p>
          ) : null}
        </AnimatePresence>
      </div>

      <ol className="overflow-hidden rounded-lg border border-border bg-card">
        {stages.map((stage) => (
          <li
            key={stage.id}
            className={cn(
              "flex items-start gap-3.5 border-b border-border p-3.5 transition-colors last:border-b-0",
              // The row in flight is tinted so the eye lands on it first. The
              // state is also carried by the icon and the wording beneath the
              // title, so colour is never the only signal (§11.6).
              stage.state === "running" && "bg-info-muted/40",
            )}
          >
            <span
              className={cn(
                "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full transition-colors",
                stage.state === "done" && "bg-success-muted text-success",
                stage.state === "running" && "bg-info-muted text-primary",
                stage.state === "waiting" && "bg-muted text-muted-foreground",
              )}
            >
              {/*
                The icon swap is the moment a journey finishes — the one event
                on this screen worth animating, because it is the only one that
                tells the reader something new.
              */}
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={stage.state}
                  initial={reduced ? false : { scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={reduced ? undefined : { scale: 0.6, opacity: 0 }}
                  transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                  className="grid place-items-center"
                >
                  {stage.state === "done" ? (
                    <CheckIcon className="size-3.5" />
                  ) : stage.state === "running" ? (
                    <span className="size-2 rounded-full bg-primary motion-safe:animate-pulse" />
                  ) : (
                    <ClockIcon className="size-3.5" />
                  )}
                </motion.span>
              </AnimatePresence>
            </span>
            <div className="min-w-0">
              <p
                className={cn(
                  "text-small font-semibold",
                  stage.state === "waiting" && "text-muted-foreground",
                )}
              >
                {stage.title}
              </p>
              <p className="text-caption text-muted-foreground">{stage.detail}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
