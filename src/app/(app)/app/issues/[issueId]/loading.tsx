import { t } from "@pdm/shared/copy";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

/**
 * §11.7 — skeleton for Issue Detail finding view.
 */
export default function IssueDetailLoading() {
  return (
    <div
      className="mx-auto flex max-w-4xl w-full flex-col gap-5"
      role="status"
      aria-label={t("a11y.loading")}
    >
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-8 w-64" />
        </div>
        <Skeleton className="h-4 w-48" />
      </div>

      <Card className="flex flex-col gap-2 p-5">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-5 w-3/4" />
      </Card>

      <Card className="flex flex-col gap-2 p-5">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </Card>

      <Card className="flex flex-col gap-3 p-5">
        <Skeleton className="h-3 w-28" />
        <div className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="flex flex-col gap-1">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-4 w-28" />
            </div>
          ))}
        </div>
      </Card>

      <Card className="flex flex-col gap-2 p-5">
        <Skeleton className="h-3 w-36" />
        <Skeleton className="h-4 w-4/5" />
      </Card>
    </div>
  );
}
