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
 * Presentational only. The live updates that drive it (polling or SSE against
 * `ScanPhase` rows) are Phase 2.
 */

export interface ProgressStage {
  id: string;
  title: string;
  detail: string;
  state: "done" | "running" | "waiting";
}

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
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="mb-2 flex flex-wrap justify-between gap-2 text-caption text-muted-foreground">
          <span>{currentLabel}</span>
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
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out motion-reduce:transition-none"
            style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
          />
        </div>
      </div>

      <ol className="rounded-lg border border-border bg-card">
        {stages.map((stage) => (
          <li
            key={stage.id}
            className="flex items-start gap-3.5 border-b border-border p-3.5 last:border-b-0"
          >
            <span
              className={cn(
                "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full",
                stage.state === "done" && "bg-success-muted text-success",
                stage.state === "running" && "bg-info-muted text-primary",
                stage.state === "waiting" && "bg-muted text-muted-foreground",
              )}
            >
              {stage.state === "done" ? (
                <CheckIcon className="size-3.5" />
              ) : stage.state === "running" ? (
                <span className="size-2 rounded-full bg-primary motion-safe:animate-pulse" />
              ) : (
                <ClockIcon className="size-3.5" />
              )}
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
