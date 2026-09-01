import { Skeleton } from "@/components/ui/skeleton";

/**
 * BILLING LOADING STATE — §11.7: "skeletons shaped like the real content, never
 * a full-page spinner".
 *
 * The shapes match the page's four cards, so the layout does not jump when the
 * Stripe read (the slowest thing here — a network call to a third party) lands.
 */
export default function BillingLoading() {
  return (
    <div className="flex w-full flex-col gap-5">
      <Skeleton className="h-9 w-40" />
      <Skeleton className="h-28 w-full rounded-lg" />
      <Skeleton className="h-72 w-full rounded-lg" />
      <Skeleton className="h-64 w-full rounded-lg" />
    </div>
  );
}
