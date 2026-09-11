import { Skeleton } from "@/components/ui/skeleton";

export default function InviteLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="flex w-full max-w-md flex-col gap-4 rounded-xl border border-border bg-card p-6 shadow-sm">
        <Skeleton className="mx-auto h-7 w-48" />
        <Skeleton className="mx-auto h-4 w-64" />
        <div className="mt-4 flex flex-col gap-2.5">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    </main>
  );
}
