import { t } from "@pdm/shared/copy";
import { Skeleton, TableSkeleton } from "@/components/ui/skeleton";

/**
 * §11.7 — skeletons shaped like the real content. Four tiles then a table,
 * matching the dashboard exactly, so nothing shifts when data arrives.
 */
export default function DashboardLoading() {
  return (
    <div
      className="flex w-full flex-col gap-5"
      role="status"
      aria-label={t("a11y.loading")}
    >
      <Skeleton className="h-8 w-56" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-24" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-20" />
        ))}
      </div>
      <TableSkeleton rows={4} />
    </div>
  );
}
