import { unsafeGlobalClient } from "@pdm/database";
import { t } from "@pdm/shared/copy";
import { PortalSettingsForm } from "@/components/portal/settings-form";
import { requirePortalSession } from "@/server/portal/session";

/**
 * PORTAL SETTINGS — §3.13: "Contact details, notification preferences. Nothing
 * else."
 *
 * ⚠️ THREE FIELDS, AND THAT IS THE WHOLE WRITE SURFACE OF THE PORTAL (§6.10).
 * Keeping it to one mutation is what makes `SameSite=Lax` plus an origin check
 * a sufficient CSRF story; a fourth field means revisiting that decision, not
 * adding an input.
 */
const db = unsafeGlobalClient(
  // Justification (required in review): read scoped by the SESSION's own
  // portalUserId and clientId, which is narrower than any tenant scope.
  "portal settings read is scoped by the session's own ids",
);

export default async function PortalSettingsPage() {
  const session = await requirePortalSession();

  const portalUser = await db.portalUser.findFirst({
    where: {
      id: session.portalUserId,
      agencyId: session.agencyId,
      clientId: session.clientId,
    },
    select: { name: true, email: true, notifyReports: true, notifyCriticalAlerts: true },
  });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-[30px] font-semibold leading-tight">
        {t("portal.settingsTitle")}
      </h1>

      <p className="text-muted-foreground">{portalUser?.email ?? session.email}</p>

      <PortalSettingsForm
        initial={{
          name: portalUser?.name ?? null,
          notifyReports: portalUser?.notifyReports ?? true,
          notifyCriticalAlerts: portalUser?.notifyCriticalAlerts ?? true,
        }}
      />
    </div>
  );
}
