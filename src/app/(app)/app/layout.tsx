import { redirect } from "next/navigation";
import { repositoriesFor } from "@pdm/database/repositories";
import { t } from "@pdm/shared/copy";
import {
  AgencySuspendedError,
  NoAgencyError,
  NotAMemberError,
} from "@pdm/shared/errors";
import { AppShell } from "@/components/app-shell/app-shell";
import { AlertTriangleIcon } from "@/components/ui/icons";
import { requireAgencyContext } from "@/server/auth/context";
import { getEntitlements } from "@/server/entitlements";
import { getNotificationBell } from "@/server/queries/notifications";
import { FLAGS, isFlagEnabled } from "@/server/flags";

/**
 * AUTHENTICATED SHELL — §3.1, §3.3.
 *
 * One of the four route-group layouts §3.1 requires, each with its own auth
 * posture, "so an unauthenticated page can never accidentally inherit an
 * authenticated shell". Everything under `/app` resolves tenant context here.
 *
 * ⚠️ This layout is NOT an authorization boundary for the pages beneath it.
 * Next renders layouts and pages independently, and a Server Action POSTs to
 * its own route — so every page re-resolves context and every action calls
 * `requirePermission()` itself (§6.1).
 *
 * ROUTING ON FAILURE (§3.3) is by error CODE, never by message text:
 *   NO_AGENCY        → /app/onboarding
 *   AGENCY_SUSPENDED → rendered inline (see below)
 *   NOT_A_MEMBER     → 403
 */
export default async function AppLayout({ children }: LayoutProps<"/app">) {
  let ctx;
  try {
    ctx = await requireAgencyContext();
  } catch (error) {
    if (error instanceof NoAgencyError) {
      // `redirect()` signals by throwing, so it is called from the CATCH block
      // and never from inside the `try` — a redirect raised in there would be
      // swallowed by this very handler and the user would sit on a blank page.
      return redirect("/app/onboarding");
    }
    if (error instanceof AgencySuspendedError) {
      // §3.3 routes this to /app/billing?suspended=1. Billing is Phase 6 and
      // that route does not exist yet; redirecting to a 404 is worse than
      // saying what happened, so the notice renders here until it does.
      return <SuspendedNotice message={error.message} />;
    }
    if (error instanceof NotAMemberError) {
      return <SuspendedNotice message={error.message} />;
    }
    throw error;
  }

  const repos = repositoriesFor(ctx.agencyId);
  const [websitesUsed, entitlements, bell, aiAssistant] = await Promise.all([
    repos.db.website.count({ where: { archivedAt: null } }),
    getEntitlements(ctx.agencyId),
    // ⚠️ Scoped to THIS user, not the agency. A notification is addressed to a
    // person, and a shared count would move on its own as colleagues read
    // theirs (§3.11).
    getNotificationBell(ctx),
    /*
     * ⚠️ FLAGS ARE RESOLVED HERE, IN THE SERVER LAYOUT, because the sidebar is
     * a Client Component and cannot read the flag table. `NAV_ITEMS` declares
     * which entries are flagged; this resolves them and passes the answers
     * down, so a flagged link is never rendered as a 404 waiting to happen.
     */
    isFlagEnabled(FLAGS.AI_ASSISTANT_PAGE, ctx.agencyId),
  ]);

  const enabledFlags = aiAssistant ? [FLAGS.AI_ASSISTANT_PAGE] : [];

  return (
    <AppShell
      role={ctx.role}
      agencyName={ctx.agencyName}
      websitesUsed={websitesUsed}
      websiteLimit={entitlements.websiteLimit}
      enabledFlags={enabledFlags}
      unreadNotifications={bell.unread}
      latestNotifications={bell.latest.map((row) => ({
        id: row.id,
        title: row.title,
        body: row.body,
        severity: row.severity,
        linkUrl: row.linkUrl,
        createdAtIso: row.createdAt.toISOString(),
        unread: row.readAt === null,
      }))}
    >
      {children}
    </AppShell>
  );
}

/**
 * Rendered without the shell on purpose: a suspended or non-member session
 * should not be handed navigation into pages it cannot load.
 */
function SuspendedNotice({ message }: { message: string }) {
  return (
    <div className="flex min-h-svh items-center justify-center bg-canvas px-4">
      <div className="flex max-w-md gap-3 rounded-lg border border-border bg-card p-5">
        <AlertTriangleIcon className="mt-0.5 shrink-0 text-warning" />
        <div>
          <h1 className="text-h4">{t("app.name")}</h1>
          <p className="mt-1 text-small text-muted-foreground">{message}</p>
        </div>
      </div>
    </div>
  );
}
