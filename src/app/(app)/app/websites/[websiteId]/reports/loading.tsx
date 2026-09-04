import { t } from "@pdm/shared/copy";
import { CardListSkeleton } from "@/components/ui/skeleton";

/** §11.7 — shaped like this tab's list, not like the Overview page. */
export default function Loading() {
  return (
    <div role="status" aria-label={t("a11y.loading")}>
      <CardListSkeleton />
    </div>
  );
}
