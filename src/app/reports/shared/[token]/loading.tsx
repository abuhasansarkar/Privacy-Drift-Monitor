import { Skeleton } from "@/components/ui/skeleton";

export default function SharedReportLoading() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="flex w-full max-w-lg flex-col gap-4 rounded-xl border border-border bg-card p-6 shadow-sm">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-64" />
        <div className="mt-4 flex flex-col gap-2">
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    </main>
  );
}
