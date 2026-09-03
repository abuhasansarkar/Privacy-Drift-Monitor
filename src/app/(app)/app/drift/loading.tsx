import { t } from "@pdm/shared/copy";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

/**
 * §11.7 — timeline skeleton for Privacy Drift feed.
 */
export default function DriftLoading() {
  return (
    <div
      className="mx-auto flex max-w-4xl w-full flex-col gap-5"
      role="status"
      aria-label={t("a11y.loading")}
    >
      <div className="flex flex-col gap-1">
        <Skeleton className="h-8 w-44" />
        <Skeleton className="h-4 w-56" />
      </div>

      <div className="flex flex-col gap-6">
        {[1, 2].map((section) => (
          <div key={section} className="flex flex-col gap-3">
            <Skeleton className="h-5 w-48" />
            <div className="flex flex-col gap-3 border-s border-border ps-4">
              {[1, 2].map((item) => (
                <Card key={item} className="p-4 flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-5 w-20" />
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="ms-auto h-4 w-28" />
                  </div>
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-6 w-48" />
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
