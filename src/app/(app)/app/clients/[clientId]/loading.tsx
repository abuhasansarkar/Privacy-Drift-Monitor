import { t } from "@pdm/shared/copy";
import { Skeleton, TableSkeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

/**
 * §11.7 — skeleton for Client Detail view.
 */
export default function ClientDetailLoading() {
  return (
    <div
      className="flex w-full flex-col gap-5"
      role="status"
      aria-label={t("a11y.loading")}
    >
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
        <Skeleton className="h-9 w-32" />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Card key={i} className="flex flex-col gap-2 p-4">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-8 w-20" />
          </Card>
        ))}
      </div>

      <TableSkeleton rows={4} />
    </div>
  );
}
