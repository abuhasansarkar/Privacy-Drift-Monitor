import { t } from "@pdm/shared/copy";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

/**
 * §11.7 — skeleton for website detail tabs.
 */
export default function WebsiteDetailLoading() {
  return (
    <div
      className="flex flex-col gap-4"
      role="status"
      aria-label={t("a11y.loading")}
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Card key={i} className="flex flex-col gap-2 p-4">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-8 w-28" />
          </Card>
        ))}
      </div>

      <Card className="flex flex-col gap-4 p-4">
        <Skeleton className="h-5 w-36" />
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex flex-col gap-1.5">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-4 w-48" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
