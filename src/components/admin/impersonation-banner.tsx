import { t } from "@pdm/shared/copy";
import { Button } from "@/components/ui/button";
import { AlertTriangleIcon } from "@/components/ui/icons";
import { formatDateTime } from "@/lib/format";
import { stopImpersonationAction } from "@/server/admin/actions";
import { currentImpersonation } from "@/server/admin/impersonation";

/**
 * THE SUPPORT-SESSION BANNER — PLAN.md §3.12, feature doc 19 ("prominent banner
 * while active").
 *
 * ⚠️ IT IS RENDERED BY THE **CUSTOMER APP'S** LAYOUT, not by the admin shell,
 * because that is where the danger is. An operator inside `/app` looking at
 * somebody else's dashboard has no other cue that the data is not their own —
 * the sidebar, the colours and the URL are all identical. Losing track of that
 * for one action is how a support note ends up in a customer's issue.
 *
 * ⚠️ IT NAMES THE AGENCY, THE REASON AND THE EXPIRY. All three are already
 * recorded; showing them makes the operator's own accountability visible while
 * they work rather than only afterwards in a log.
 *
 * Renders nothing — and costs one cookie read — when no session is active.
 */
export async function ImpersonationBanner() {
  const ticket = await currentImpersonation();
  if (!ticket) return null;

  /*
   * ⚠️ AN ABSOLUTE EXPIRY, NOT A COUNTDOWN, and the lint rule that forced this
   * was right. `Date.now()` in a render is impure: the "12 minutes left" the
   * server rendered is frozen at whatever it was when the page was built, so it
   * says twelve minutes for the rest of the session and is wrong within one.
   * A fixed clock time cannot go stale.
   */
  const expiresAt = new Date(ticket.expiresAt);

  return (
    <div className="flex flex-wrap items-center gap-3 border-b-2 border-danger bg-danger px-4 py-2 text-danger-foreground">
      <AlertTriangleIcon className="shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-small font-medium">
          {t("admin.chip")} · support session · read-only
        </p>
        <p className="truncate text-caption opacity-90">
          {ticket.reason} · until {formatDateTime(expiresAt, "UTC")} UTC
        </p>
      </div>
      <form action={stopImpersonationAction}>
        <Button type="submit" variant="secondary" size="sm">
          End session
        </Button>
      </form>
    </div>
  );
}
