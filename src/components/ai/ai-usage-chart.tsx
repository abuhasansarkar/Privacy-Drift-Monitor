import { t } from "@pdm/shared/copy";
import type { AiUsageDay } from "@/server/queries/ai-usage";
import { formatNumber } from "@/lib/format";

/**
 * AI CREDIT USAGE CHART — PLAN.md Part VIII §8.9, Part XI §11.3, Phase 5
 * task 5.8.
 *
 * Design decisions, in the order the `dataviz` procedure asks for them:
 *
 * 1. FORM. The job is magnitude over time across ~30 discrete, countable days,
 *    so bars, not a line: a line implies a continuous quantity sampled between
 *    points, and "credits spent on the 14th" is a count with nothing in
 *    between. The three summary numbers above it are NOT in the chart — cache
 *    hits and rejections are totals, and a total is a stat tile, not a series.
 *
 * 2. COLOR. ONE series, so one hue: `--primary`, the token §11.3 already fixes.
 *    No categorical palette is involved, so there is no adjacent-pair CVD
 *    question to validate — the pairing that matters is bar against surface,
 *    and `#2563eb` on `--card` (#ffffff) is ~5.2:1, above the 3:1 floor for a
 *    graphical object. Dark mode is not an automatic flip: `--primary` is
 *    separately defined as `#3b82f6` against the dark surface in
 *    `globals.css`, so the bar re-steps with the theme rather than inverting.
 *
 * 3. MARKS. Thin bars with a 2px surface gap between them and 4px rounded tops
 *    anchored to the baseline. A zero-credit day draws a 1px baseline tick
 *    rather than nothing — "we spent nothing" and "we have no data" are
 *    different facts, and an absent bar says the second when it means the first.
 *
 * 4. NO LEGEND, BY RULE. One series is named by the title; a legend box for a
 *    single series is furniture. Values are NOT printed on every bar — only the
 *    peak is direct-labeled, which is what makes the shape readable.
 *
 * 5. TEXT WEARS TEXT TOKENS. Every label is `muted-foreground`; the bar alone
 *    carries the colour. A number tinted with the series hue reads as a status.
 *
 * ⚠️ A SERVER COMPONENT WITH NO JAVASCRIPT. The hover layer is `<title>` inside
 * each bar's group — the browser's own tooltip, which also reaches the
 * accessibility tree. A settings page does not deserve a charting library, and
 * the numbers are additionally available as a real `<table>` below, so the
 * chart is never the only way to read them.
 */

const HEIGHT = 96;
const BAR_GAP = 2;

export function AiUsageChart({ days }: { days: readonly AiUsageDay[] }) {
  if (days.length === 0) {
    return (
      <p className="text-small text-muted-foreground">{t("aiSettings.noUsageYet")}</p>
    );
  }

  const max = Math.max(...days.map((day) => day.credits), 1);
  const peak = days.reduce((a, b) => (b.credits > a.credits ? b : a), days[0]!);

  // A viewBox of one unit per day lets the SVG scale to any container width
  // without recomputing anything — `preserveAspectRatio="none"` would distort
  // the rounded corners, so the width is in day-units and the height is fixed.
  const width = days.length * 10;

  return (
    <figure className="flex flex-col gap-2">
      <svg
        viewBox={`0 0 ${width} ${HEIGHT}`}
        className="h-24 w-full"
        role="img"
        aria-label={t("aiSettings.chartLabel")}
      >
        {days.map((day, index) => {
          const barHeight = day.credits === 0 ? 1 : (day.credits / max) * (HEIGHT - 8);
          return (
            <g key={day.date}>
              <title>{`${day.date}: ${day.credits} · ${day.calls} calls`}</title>
              <rect
                x={index * 10}
                y={HEIGHT - barHeight}
                width={10 - BAR_GAP}
                height={barHeight}
                rx={day.credits === 0 ? 0 : 3}
                className={
                  day.credits === 0 ? "fill-border" : "fill-primary"
                }
              />
            </g>
          );
        })}
      </svg>

      <figcaption className="flex flex-wrap items-baseline justify-between gap-2 text-caption text-muted-foreground">
        <span>{days[0]?.date}</span>
        {/* The only direct label: the peak. Labelling every bar would make the
            shape unreadable, which is the thing the chart is for. */}
        <span className="tabular-nums">
          {t("aiSettings.peakDay")} {peak.date} · {formatNumber(peak.credits)}
        </span>
        <span>{days[days.length - 1]?.date}</span>
      </figcaption>
    </figure>
  );
}

/**
 * The same numbers as a table.
 *
 * ⚠️ NOT A FALLBACK — a peer. `dataviz`'s accessibility pass requires a table
 * view to exist, and it is also the honest answer to "what exactly did we spend
 * on the 14th", which a 10px bar cannot answer however good it looks.
 */
export function AiUsageTable({ days }: { days: readonly AiUsageDay[] }) {
  if (days.length === 0) return null;

  return (
    <details className="text-small">
      <summary className="cursor-pointer text-muted-foreground">
        {t("aiSettings.showTable")}
      </summary>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-caption">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th scope="col" className="py-1.5 pe-3 font-medium">
                {t("aiSettings.columnDate")}
              </th>
              <th scope="col" className="py-1.5 pe-3 font-medium">
                {t("aiSettings.columnCredits")}
              </th>
              <th scope="col" className="py-1.5 pe-3 font-medium">
                {t("aiSettings.columnCalls")}
              </th>
              <th scope="col" className="py-1.5 pe-3 font-medium">
                {t("aiSettings.columnCached")}
              </th>
              <th scope="col" className="py-1.5 font-medium">
                {t("aiSettings.columnRejected")}
              </th>
            </tr>
          </thead>
          <tbody>
            {days.map((day) => (
              <tr key={day.date} className="border-b border-border/60">
                <td className="py-1.5 pe-3 font-mono">{day.date}</td>
                <td className="py-1.5 pe-3 tabular-nums">{formatNumber(day.credits)}</td>
                <td className="py-1.5 pe-3 tabular-nums">{formatNumber(day.calls)}</td>
                <td className="py-1.5 pe-3 tabular-nums">{formatNumber(day.cached)}</td>
                <td className="py-1.5 tabular-nums">{formatNumber(day.failed)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
