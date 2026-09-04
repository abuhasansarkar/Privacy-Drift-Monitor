import { t } from "@pdm/shared/copy";
import { CardListSkeleton, Skeleton } from "@/components/ui/skeleton";

/**
 * §11.7 — the evidence vault is the densest tab, so its skeleton carries the
 * two strips above the table (scan picker, then the request filters). Dropping
 * them would let the table render high and then jump down once they arrive.
 */
export default function Loading() {
  return (
    <div
      className="flex flex-col gap-4"
      role="status"
      aria-label={t("a11y.loading")}
    >
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-32" />
        <div className="flex gap-2 overflow-hidden">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-6 w-36 shrink-0" />
          ))}
        </div>
      </div>
      <CardListSkeleton rows={10} withToolbar />
    </div>
  );
}
