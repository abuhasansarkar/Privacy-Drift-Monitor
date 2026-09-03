import { t } from "@pdm/shared/copy";
import { Skeleton, TableSkeleton } from "@/components/ui/skeleton";

export default function PortalLoading() {
  return (
    <div
      className="flex w-full flex-col gap-5"
      role="status"
      aria-label={t("a11y.loading")}
    >
      <Skeleton className="h-8 w-40" />
      <TableSkeleton />
    </div>
  );
}
