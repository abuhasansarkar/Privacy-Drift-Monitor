import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { ChevronRightIcon } from "./icons";

/**
 * RESPONSIVE DATA LIST — §11.5.
 *
 * One row definition, two renderings:
 *   >= md  a dense table, which is what this product is for — an account manager
 *          scanning twenty sites wants columns, not cards.
 *   <  md  a stacked card per row, because a six-column table on a 390px screen
 *          is either unreadable or a horizontal-scroll trap.
 *
 * Deliberately ONE source of truth: the alternative — writing the table and the
 * card markup separately behind `max-md:hidden` / `md:hidden` — is how the two
 * silently diverge, and the mobile view is the one nobody re-checks.
 *
 * Columns may opt out of the mobile card (`mobileHidden`) when they are
 * redundant there; nothing opts out of the table.
 */

export interface Column {
  key: string;
  label: string;
  /** Numeric columns read better right-aligned in the table. */
  align?: "start" | "end";
  /** Drop from the stacked card — the row's primary line already carries it. */
  mobileHidden?: boolean;
  /** Drop from the table below this breakpoint. Cards are unaffected. */
  hideBelow?: "lg" | "xl";
}

export interface Row {
  id: string;
  /** Makes the whole row navigable. Renders a real `<a>`, not an onClick. */
  href?: string;
  /** The identifying line — usually the address or the name. */
  primary: ReactNode;
  secondary?: ReactNode;
  cells: Record<string, ReactNode>;
  /** Visually recede an archived or paused row without hiding it. */
  dimmed?: boolean;
  /**
   * Tints the row to draw the eye.
   *
   * ⚠️ A tint HIGHLIGHTS, it does not judge. §11.6 forbids conveying meaning by
   * colour alone, so a tinted row must also carry a badge or chip that says
   * what is notable about it — the colour is the second signal, never the only
   * one, and never a verdict.
   */
  tone?: "warning";
}

const HIDE_BELOW: Record<NonNullable<Column["hideBelow"]>, string> = {
  lg: "max-lg:hidden",
  xl: "max-xl:hidden",
};

export function DataList({
  caption,
  columns,
  rows,
  footer,
  selection,
}: {
  /** Screen-reader name for the table. Never rendered visually. */
  caption: string;
  columns: Column[];
  rows: Row[];
  footer?: ReactNode;
  /**
   * Row selection, owned by the CALLER.
   *
   * ⚠️ The table does not hold selection state. It renders a checkbox and
   * reports a toggle; who is selected, and what may be done with them, is a
   * decision with permissions attached and belongs to the client component
   * that also renders the bulk bar.
   */
  selection?: {
    selected: ReadonlySet<string>;
    onToggle: (id: string) => void;
    label: string;
  };
}) {
  // No border or background here: the caller wraps this in a `<Card>`, and a
  // second bordered box inside one draws a double rule at every edge.
  return (
    <div>
      {/* ── Table: md and up ───────────────────────────────────────── */}
      <div className="max-md:hidden overflow-x-auto">
        <table className="w-full border-collapse text-small">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              {selection ? (
                // Header cell is empty on purpose: the select-all control lives
                // in the bulk bar above, where its count is visible.
                <th scope="col" className="w-9 ps-4" />
              ) : null}
              <th
                scope="col"
                className="w-full px-4 py-2.5 text-start text-caption font-semibold uppercase tracking-wide text-muted-foreground"
              >
                {columns[0]?.label}
              </th>
              {columns.slice(1).map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={cn(
                    "whitespace-nowrap px-4 py-2.5 text-caption font-semibold uppercase tracking-wide text-muted-foreground",
                    column.align === "end" ? "text-end" : "text-start",
                    column.hideBelow && HIDE_BELOW[column.hideBelow],
                  )}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className={cn(
                  "border-t border-border",
                  row.tone === "warning" && "bg-warning-muted",
                  selection?.selected.has(row.id) && "bg-primary/5",
                  row.dimmed && "opacity-60",
                )}
              >
                {selection ? (
                  <td className="ps-4">
                    <input
                      type="checkbox"
                      checked={selection.selected.has(row.id)}
                      onChange={() => selection.onToggle(row.id)}
                      aria-label={`${selection.label}: ${row.id}`}
                      className="size-4 accent-primary"
                    />
                  </td>
                ) : null}
                <td className="px-4 py-3">
                  <RowIdentity row={row} />
                </td>
                {columns.slice(1).map((column) => (
                  <td
                    key={column.key}
                    className={cn(
                      "whitespace-nowrap px-4 py-3",
                      column.align === "end" ? "text-end" : "text-start",
                      column.hideBelow && HIDE_BELOW[column.hideBelow],
                    )}
                  >
                    {row.cells[column.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Stacked cards: below md ────────────────────────────────── */}
      <ul className="md:hidden">
        {rows.map((row) => (
          <li
            key={row.id}
            className={cn(
              "border-b border-border p-4 last:border-b-0",
              row.dimmed && "opacity-60",
              selection?.selected.has(row.id) && "bg-primary/5",
              // The tint has to survive to the phone: a highlight that only
              // exists at desktop width is a highlight half the readers never
              // see.
              row.tone === "warning" && "bg-warning-muted",
            )}
          >
            <div className="flex items-start gap-3">
              {selection ? (
                <input
                  type="checkbox"
                  checked={selection.selected.has(row.id)}
                  onChange={() => selection.onToggle(row.id)}
                  aria-label={`${selection.label}: ${row.id}`}
                  className="mt-1 size-4 shrink-0 accent-primary"
                />
              ) : null}
              <div className="min-w-0 flex-1">
                <RowIdentity row={row} />
              </div>
              {row.href ? (
                <ChevronRightIcon className="mt-1 text-muted-foreground" />
              ) : null}
            </div>
            <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
              {columns
                .slice(1)
                .filter((column) => !column.mobileHidden)
                .map((column) => (
                  <div key={column.key} className="flex flex-col gap-0.5">
                    <dt className="text-caption uppercase tracking-wide text-muted-foreground">
                      {column.label}
                    </dt>
                    <dd className="text-small">{row.cells[column.key]}</dd>
                  </div>
                ))}
            </dl>
          </li>
        ))}
      </ul>

      {footer ? (
        <div className="flex flex-wrap items-center gap-3 border-t border-border px-4 py-2.5 text-caption text-muted-foreground">
          {footer}
        </div>
      ) : null}
    </div>
  );
}

/**
 * The identifying line. When the row is navigable the LINK wraps only this —
 * not the whole row — so the badges and counts beside it stay selectable and
 * screen-reader users get one link with a meaningful name instead of a link
 * that reads out the entire row.
 */
function RowIdentity({ row }: { row: Row }) {
  const identity = (
    <>
      <span className="block truncate font-medium">{row.primary}</span>
      {row.secondary ? (
        <span className="block truncate text-caption text-muted-foreground">
          {row.secondary}
        </span>
      ) : null}
    </>
  );

  return row.href ? (
    <Link href={row.href} className="block min-w-0 rounded-sm hover:underline">
      {identity}
    </Link>
  ) : (
    <div className="min-w-0">{identity}</div>
  );
}
