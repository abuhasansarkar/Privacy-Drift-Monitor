import { t } from "@pdm/shared/copy";
import { isUnlimited, type UsageSummary } from "@pdm/billing";
import type { UsageMetric } from "@pdm/schemas";
import { Card, CardHeader } from "@/components/ui/card";
import { AlertTriangleIcon, CheckIcon } from "@/components/ui/icons";
import { formatBytes, formatDate, formatNumber } from "@/lib/format";

/**
 * USAGE METERS — §3.11, Phase 6 task 6.3.
 *
 * "usage meters (websites, scans this period, AI credits, team seats, storage)
 * each with a percentage bar and an over-limit state".
 *
 * ⚠️ THREE STATES, NOT TWO. Under limit, NEARING (>= 80%, §9.2's notification
 * threshold) and OVER. The over state exists because a downgrade can put an
 * agency above a limit it was under yesterday — §9.2 is explicit that this is
 * grace, not deletion, so the meter has to be able to draw past 100% without
 * either clipping silently or looking like a fault.
 *
 * ⚠️ COLOUR PLUS ICON PLUS TEXT (§11.6 / WCAG 1.4.1). The bar going amber is
 * never the only signal — every non-normal state carries a line of text with an
 * icon beside it.
 */

const METRIC_LABEL: Record<UsageMetric, string> = {
  WEBSITES: t("billing.metricWebsites"),
  SEATS: t("billing.metricSeats"),
  SCANS: t("billing.metricScans"),
  AI_CREDITS: t("billing.metricAiCredits"),
  REPORTS: t("billing.metricReports"),
  STORAGE_BYTES: t("billing.metricStorage"),
};

function renderValue(metric: UsageMetric, value: number): string {
  return metric === "STORAGE_BYTES" ? formatBytes(value) : formatNumber(value);
}

export function UsageMeters({
  usage,
  timeZone,
}: {
  usage: UsageSummary[];
  timeZone: string;
}) {
  const period = usage[0];

  return (
    <Card>
      <CardHeader
        title={t("billing.usageTitle")}
        action={
          period ? (
            <span className="text-caption text-muted-foreground">
              {formatDate(period.periodStart, timeZone)} –{" "}
              {formatDate(period.periodEnd, timeZone)}
            </span>
          ) : undefined
        }
      />
      <ul className="flex flex-col divide-y divide-border">
        {usage.map((row) => (
          <li key={row.metric} className="px-4 py-3.5">
            <Meter row={row} />
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Meter({ row }: { row: UsageSummary }) {
  const label = METRIC_LABEL[row.metric];
  const uncapped = row.limit === null || isUnlimited(row.limit);
  const over = !uncapped && row.used > (row.limit as number);
  /*
   * ⚠️ THE BAR IS CLAMPED, THE TEXT IS NOT. A width of 140% would paint outside
   * its track and read as a rendering bug; the numbers beside it say 14 of 10,
   * which is the honest figure. Clamping the visual and not the value is the
   * only combination that is both correct and legible.
   */
  const percent = uncapped
    ? 0
    : Math.min(100, Math.round((row.used / Math.max(1, row.limit as number)) * 100));

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline gap-2">
        <span className="text-small font-medium">{label}</span>
        <span className="ml-auto text-small tabular-nums">
          {renderValue(row.metric, row.used)}
          {uncapped ? null : (
            <span className="text-muted-foreground">
              {" "}
              {t("billing.ofLimit")} {formatNumber(row.limit as number)}
            </span>
          )}
        </span>
      </div>

      {uncapped ? (
        <p className="text-caption text-muted-foreground">
          {row.metric === "STORAGE_BYTES"
            ? t("billing.metricNotMetered")
            : t("billing.unlimited")}
        </p>
      ) : (
        <>
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={label}
          >
            <div
              className={
                over ? "h-full bg-danger" : row.nearingLimit ? "h-full bg-warning" : "h-full bg-primary"
              }
              style={{ width: `${percent}%` }}
            />
          </div>
          {over ? (
            <p className="flex items-center gap-1.5 text-caption text-danger">
              <AlertTriangleIcon />
              {t("billing.graceTitle")}
            </p>
          ) : row.nearingLimit ? (
            <p className="flex items-center gap-1.5 text-caption text-warning">
              <AlertTriangleIcon />
              {formatNumber(row.remaining ?? 0)} {t("billing.ofLimit")}{" "}
              {formatNumber(row.limit as number)} {t("billing.remaining")}
            </p>
          ) : (
            <p className="flex items-center gap-1.5 text-caption text-muted-foreground">
              <CheckIcon />
              {formatNumber(row.remaining ?? 0)} {t("billing.remaining")}
            </p>
          )}
        </>
      )}
    </div>
  );
}
