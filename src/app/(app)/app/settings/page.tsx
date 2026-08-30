import { t } from "@pdm/shared/copy";
import { Card } from "@/components/ui/card";
import { requireAgencyContext } from "@/server/auth/context";

/**
 * SETTINGS — GENERAL — §3.12, Phase 1 task 1.10.
 *
 * ⚠️ READ-ONLY FOR NOW, and it says so rather than showing disabled inputs. A
 * form whose Save button does nothing is a worse lie than a plain statement:
 * agency name and timezone are Clerk's organization profile plus a column we
 * do not yet have an editor for, and pretending otherwise loses data silently.
 */
export default async function GeneralSettingsPage() {
  const ctx = await requireAgencyContext();

  return (
    <Card className="p-4 sm:p-5">
      <dl className="grid gap-4 sm:grid-cols-2">
        <div>
          <dt className="text-caption text-muted-foreground">
            {t("settings.agencyName")}
          </dt>
          <dd className="mt-0.5 text-small font-medium">{ctx.agencyName}</dd>
        </div>
        <div>
          <dt className="text-caption text-muted-foreground">
            {t("settings.timezone")}
          </dt>
          <dd className="mt-0.5 font-mono text-mono">{ctx.timezone}</dd>
        </div>
        <div>
          <dt className="text-caption text-muted-foreground">
            {t("settings.yourRole")}
          </dt>
          <dd className="mt-0.5 text-small font-medium">{ctx.role}</dd>
        </div>
      </dl>
      <p className="mt-4 text-small text-muted-foreground">
        {t("settings.managedInClerk")}
      </p>
    </Card>
  );
}
