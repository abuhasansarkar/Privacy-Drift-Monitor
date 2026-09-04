import { cn } from "@/lib/cn";

/**
 * SKELETON — §11.7.
 *
 * Skeletons are shaped like the content they replace; a full-page spinner is
 * explicitly not acceptable. `motion-reduce:animate-none` honours §11.6.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-muted motion-reduce:animate-none",
        className,
      )}
    />
  );
}

/**
 * The shape of a website-hub tab: a titled card wrapping a `DataList`.
 *
 * ⚠️ SHAPE IS THE WHOLE POINT, AND THE WRONG SHAPE IS WORSE THAN NONE. Every
 * one of the ten tabs used to fall through to `[websiteId]/loading.tsx`, which
 * is drawn like the OVERVIEW page — four stat cards over a settings grid. So
 * opening Cookies showed four stat cards, then replaced them with a table. The
 * skeleton was not predicting the layout, it was predicting a different page,
 * and a reader tracking a box that then moves somewhere else has been told a
 * small lie about where to look.
 */
export function CardListSkeleton({
  rows = 6,
  withToolbar = false,
}: {
  rows?: number;
  /** Tabs that carry a filter bar above the list (evidence, scans). */
  withToolbar?: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      {withToolbar ? (
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-9 w-full max-w-64" />
          <Skeleton className="h-9 w-36 max-sm:hidden" />
          <Skeleton className="h-9 w-32 max-sm:hidden" />
        </div>
      ) : null}
      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3.5">
          <Skeleton className="h-4 w-40" />
        </div>
        {Array.from({ length: rows }, (_, index) => (
          <div
            key={index}
            className="flex items-center gap-4 border-b border-border px-4 py-3.5 last:border-b-0"
          >
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <Skeleton className="h-3.5 w-56 max-w-full" />
              <Skeleton className="h-3 w-36 max-w-full" />
            </div>
            <Skeleton className="h-5 w-20 max-sm:hidden" />
            <Skeleton className="h-5 w-16 max-md:hidden" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** The shape of a tab built from labelled blocks rather than rows. */
export function CardSectionsSkeleton({ sections = 3 }: { sections?: number }) {
  return (
    <div className="flex flex-col gap-4">
      {Array.from({ length: sections }, (_, index) => (
        <div
          key={index}
          className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4"
        >
          <Skeleton className="h-5 w-44" />
          <div className="grid gap-4 sm:grid-cols-2">
            {Array.from({ length: 4 }, (_, cell) => (
              <div key={cell} className="flex flex-col gap-1.5">
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-4 w-44 max-w-full" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** The shared shape for a list page: toolbar, then rows. */
export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3" aria-busy="true">
      <div className="flex gap-2">
        <Skeleton className="h-9 w-full max-w-56" />
        <Skeleton className="h-9 w-28 max-sm:hidden" />
        <Skeleton className="h-9 w-28 max-sm:hidden" />
      </div>
      <div className="rounded-lg border border-border bg-card">
        {Array.from({ length: rows }, (_, index) => (
          <div
            key={index}
            className="flex items-center gap-4 border-b border-border px-4 py-3.5 last:border-b-0"
          >
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <Skeleton className="h-3.5 w-48 max-w-full" />
              <Skeleton className="h-3 w-32 max-w-full" />
            </div>
            <Skeleton className="h-5 w-16 max-sm:hidden" />
            <Skeleton className="h-5 w-20 max-md:hidden" />
          </div>
        ))}
      </div>
    </div>
  );
}
