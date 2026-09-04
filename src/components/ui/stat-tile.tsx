import type { ReactNode } from "react";

/**
 * STAT TILE — §3.4, §11.4.
 *
 * The summary layer above the tables: a portfolio question answered before any
 * row is read. `note` carries the breakdown (chips, a band label) so the number
 * is never the only thing on the tile — a bare 7 does not say 7 of what
 * severity.
 */
export function StatTile({
  label,
  value,
  note,
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-card px-4 py-3.5 shadow-xs transition-all duration-200 hover:border-primary/30 hover:shadow-sm">
      <span className="text-caption font-medium text-muted-foreground">
        {label}
      </span>
      <span className="flex items-baseline gap-2 text-h1 tabular-nums">
        {value}
      </span>
      {note ? (
        <span className="flex flex-wrap items-center gap-1.5 text-caption text-muted-foreground">
          {note}
        </span>
      ) : null}
    </div>
  );
}
