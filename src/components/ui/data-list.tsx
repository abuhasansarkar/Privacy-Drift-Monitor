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
}: {
  /** Screen-reader name for the table. Never rendered visually. */
  caption: string;
  columns: Column[];
  rows: Row[];
  footer?: ReactNode;
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
                  row.dimmed && "opacity-60",
                )}
              >
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
            )}
          >
            <div className="flex items-start gap-3">
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
