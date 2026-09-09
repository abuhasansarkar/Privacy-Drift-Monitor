"use client";

import { useId, useState } from "react";
import { t } from "@pdm/shared/copy";
import type { TrendPoint } from "@/server/queries/dashboard";

/**
 * PRIVACY HEALTH TREND — §3.4, UI_DESIGN_PROMPTS §5.1 row 3.
 *
 * A single series over time, so there is no legend and no categorical palette:
 * the card title names the measure, and one hue (`--primary`, fixed by §11.3)
 * carries it.
 *
 * ⚠️ THE X AXIS IS TIME, NOT INDEX. Points are sparse — a day with no scan has
 * no point — and spacing them evenly would draw a straight line across a
 * two-week gap as though we had been watching the whole time. Position is
 * computed from the date so a gap looks like a gap.
 *
 * ⚠️ THE Y AXIS STARTS AT 0. A health score is a 0–100 measure and truncating
 * the axis to "make the trend visible" turns a 4-point wobble into a cliff —
 * the most common way a chart lies (anti-patterns: truncated axis).
 *
 * ⚠️ THE CONTAINER OWNS THE SCROLL, NOT THE CHROME. The SVG keeps its aspect
 * ratio and stretches to the card width down to a floor; the horizontal
 * scrollbar lives on the svg wrapper (where the SVG can actually overflow),
 * so the figure never forces a nested scroll inside the card.
 *
 * ⚠️ A table view is rendered for screen readers and for anyone the chart does
 * not serve; the SVG itself is `aria-hidden`.
 */

const WIDTH = 720;
const HEIGHT = 180;
const PAD = { top: 12, right: 16, bottom: 28, left: 36 };

export function HealthTrend({ points }: { points: TrendPoint[] }) {
  const gradientId = useId();
  const [hover, setHover] = useState<number | null>(null);

  // Two points is the minimum for a line to mean anything. One point is a
  // number, and it is already shown as a stat tile.
  if (points.length < 2) {
    return (
      <p className="px-4 py-8 text-center text-small text-muted-foreground">
        {t("dashboard.trendNeedsMore")}
      </p>
    );
  }

  const first = new Date(points[0]!.day).getTime();
  const last = new Date(points[points.length - 1]!.day).getTime();
  const span = Math.max(1, last - first);

  const plotWidth = WIDTH - PAD.left - PAD.right;
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;

  const x = (day: string) =>
    PAD.left + ((new Date(day).getTime() - first) / span) * plotWidth;
  const y = (score: number) => PAD.top + (1 - score / 100) * plotHeight;

  const coords = points.map((point) => ({
    ...point,
    cx: x(point.day),
    cy: y(point.score),
  }));

  const line = coords
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.cx.toFixed(1)} ${point.cy.toFixed(1)}`)
    .join(" ");
  const area = `${line} L${coords[coords.length - 1]!.cx.toFixed(1)} ${PAD.top + plotHeight} L${coords[0]!.cx.toFixed(1)} ${PAD.top + plotHeight} Z`;

  const active = hover === null ? null : coords[hover];

  // Tooltip pinned inside the plot: near the right edge it would overflow the
  // card, so it flips to the left of the crosshair instead. Computed inside
  // the guard — `active` is null until the pointer enters a hit target.
  const tooltipLeftPct = (point: NonNullable<typeof active>) =>
    Math.min(85, Math.max(15, (point.cx / WIDTH) * 100));

  return (
    <figure className="m-0 px-2 pb-3">
      <div className="relative overflow-x-auto">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="block h-auto w-full min-w-[24rem]"
          // The table below is the accessible representation; the drawing adds
          // nothing a screen reader can use.
          aria-hidden="true"
          onMouseLeave={() => setHover(null)}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.1" />
              <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Recessive gridlines: solid hairlines, one shade off the surface. */}
          {[0, 25, 50, 75, 100].map((value) => (
            <g key={value}>
              <line
                x1={PAD.left}
                x2={WIDTH - PAD.right}
                y1={y(value)}
                y2={y(value)}
                stroke="var(--border)"
                strokeWidth="1"
              />
              <text
                x={PAD.left - 8}
                y={y(value) + 3.5}
                textAnchor="end"
                fontSize="10"
                fill="var(--muted-foreground)"
              >
                {value}
              </text>
            </g>
          ))}

          {/* First/last day under the ends of the plot — time needs two anchors. */}
          <text
            x={PAD.left}
            y={HEIGHT - 8}
            fontSize="10"
            fill="var(--muted-foreground)"
          >
            {points[0]!.day}
          </text>
          <text
            x={WIDTH - PAD.right}
            y={HEIGHT - 8}
            textAnchor="end"
            fontSize="10"
            fill="var(--muted-foreground)"
          >
            {points[points.length - 1]!.day}
          </text>

          <path d={area} fill={`url(#${gradientId})`} />
          <path
            d={line}
            fill="none"
            stroke="var(--primary)"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {/* The endpoint is emphasised — "where are we now" is the question —
              and direct-labeled: the current value readable without hover. */}
          <circle
            cx={coords[coords.length - 1]!.cx}
            cy={coords[coords.length - 1]!.cy}
            r="4"
            fill="var(--primary)"
            stroke="var(--card)"
            strokeWidth="2"
          />
          <text
            x={coords[coords.length - 1]!.cx}
            y={coords[coords.length - 1]!.cy - 10}
            textAnchor="end"
            fontSize="11"
            fontWeight="500"
            fill="var(--foreground)"
            className="tabular-nums"
          >
            {points[points.length - 1]!.score}
          </text>

          {active ? (
            <>
              <line
                x1={active.cx}
                x2={active.cx}
                y1={PAD.top}
                y2={PAD.top + plotHeight}
                stroke="var(--border)"
                strokeWidth="1"
              />
              <circle
                cx={active.cx}
                cy={active.cy}
                r="4"
                fill="var(--primary)"
                stroke="var(--card)"
                strokeWidth="2"
              />
            </>
          ) : null}

          {/* Hit targets wider than the marks, so hovering is not a game. */}
          {coords.map((point, index) => (
            <rect
              key={point.day}
              x={point.cx - plotWidth / coords.length / 2}
              y={PAD.top}
              width={plotWidth / coords.length}
              height={plotHeight}
              fill="transparent"
              onMouseEnter={() => setHover(index)}
            />
          ))}
        </svg>

        {active ? (
          <div
            className="pointer-events-none absolute top-2 -translate-x-1/2 rounded-md border border-border bg-popover px-2.5 py-1.5 text-caption shadow-sm"
            style={{ left: `${tooltipLeftPct(active)}%` }}
          >
            <span className="block font-medium tabular-nums">{active.score}</span>
            <span className="block text-muted-foreground">{active.day}</span>
          </div>
        ) : null}
      </div>

      <figcaption className="sr-only">
        {t("dashboard.healthTrend")}
        <table>
          <thead>
            <tr>
              <th scope="col">{t("dashboard.trendDay")}</th>
              <th scope="col">{t("dashboard.averageHealth")}</th>
            </tr>
          </thead>
          <tbody>
            {points.map((point) => (
              <tr key={point.day}>
                <th scope="row">{point.day}</th>
                <td>{point.score}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </figcaption>
    </figure>
  );
}
