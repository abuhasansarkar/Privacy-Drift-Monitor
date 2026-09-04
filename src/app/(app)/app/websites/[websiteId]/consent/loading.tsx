import { t } from "@pdm/shared/copy";
import { CardSectionsSkeleton } from "@/components/ui/skeleton";

/** §11.7 — shaped like this tab's blocks, not like the Overview page. */
export default function Loading() {
  return (
    <div role="status" aria-label={t("a11y.loading")}>
      <CardSectionsSkeleton />
    </div>
  );
}
