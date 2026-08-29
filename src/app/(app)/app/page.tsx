import type { Metadata } from "next";
import { getCurrentUser, requireUser } from "@/server/auth/context";

export const metadata: Metadata = { title: "Dashboard" };

/**
 * Phase 0 placeholder. Proves the auth pipeline end to end:
 * proxy → layout gate → server-side identity resolution.
 *
 * Replaced in Phase 3 by the real dashboard (PLAN.md §3.4): summary strip,
 * Attention Center, health trend, drift summary, activity feed.
 */
export default async function DashboardPage() {
  const { clerkUserId, clerkOrgId } = await requireUser();
  const user = await getCurrentUser();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome{user?.firstName ? `, ${user.firstName}` : ""}
        </h1>
        <p className="mt-1 text-sm text-foreground/60">
          Authentication is working. The real dashboard arrives in Phase 3.
        </p>
      </div>

      <section className="rounded-lg border border-black/10 p-4 dark:border-white/10">
        <h2 className="text-sm font-semibold">Session</h2>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-[10rem_1fr]">
          <dt className="text-foreground/60">Email</dt>
          <dd className="font-mono text-xs">
            {user?.primaryEmailAddress?.emailAddress ?? "—"}
          </dd>

          <dt className="text-foreground/60">Clerk user id</dt>
          <dd className="font-mono text-xs break-all">{clerkUserId}</dd>

          <dt className="text-foreground/60">Clerk org id</dt>
          <dd className="font-mono text-xs break-all">
            {clerkOrgId ?? (
              <span className="text-foreground/50">
                none yet — created during onboarding, maps to Agency.clerkOrgId
              </span>
            )}
          </dd>
        </dl>
      </section>

      <section className="rounded-lg border border-dashed border-black/15 p-4 text-sm dark:border-white/15">
        <h2 className="font-semibold">Next up</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-foreground/70">
          <li>
            <code className="text-xs">packages/database</code> — Prisma schema,
            first migration, tracker seed
          </li>
          <li>
            Clerk webhook sync → <code className="text-xs">User</code>,{" "}
            <code className="text-xs">Agency</code>,{" "}
            <code className="text-xs">AgencyMember</code>
          </li>
          <li>
            Swap <code className="text-xs">requireUser()</code> for{" "}
            <code className="text-xs">requireAgencyContext()</code>
          </li>
        </ol>
      </section>
    </div>
  );
}
