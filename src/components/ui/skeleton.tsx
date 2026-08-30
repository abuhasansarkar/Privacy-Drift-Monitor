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
