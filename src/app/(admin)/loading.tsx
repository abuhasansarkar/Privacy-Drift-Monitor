import { t } from "@pdm/shared/copy";
import { Skeleton, TableSkeleton } from "@/components/ui/skeleton";

/**
 * Admin pages are cross-tenant aggregates and are the slowest reads in the
 * product. A skeleton shaped like the table that is coming beats a spinner
 * (§11.8) — and beats the blank frame this route group rendered before.
 */
export default function AdminLoading() {
  return (
    <div
      className="flex w-full flex-col gap-5"
      role="status"
      aria-label={t("a11y.loading")}
    >
      <Skeleton className="h-8 w-48" />
      <TableSkeleton />
    </div>
  );
}
