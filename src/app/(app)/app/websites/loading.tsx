import { t } from "@pdm/shared/copy";
import { Skeleton, TableSkeleton } from "@/components/ui/skeleton";

export default function WebsitesLoading() {
  return (
    <div
      className="mx-auto flex max-w-7xl flex-col gap-5"
      role="status"
      aria-label={t("a11y.loading")}
    >
      <Skeleton className="h-8 w-40" />
      <TableSkeleton />
    </div>
  );
}
