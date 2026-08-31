import type { DigestFrequency, NotificationType } from "@pdm/schemas";
import { DEFAULT_TRIGGER_TYPES } from "@pdm/notifications";
import { t } from "@pdm/shared/copy";
import { NOTIFICATION_TYPE_LABEL } from "@pdm/shared/copy/labels";
import { NotificationPreferencesForm } from "@/components/notifications/preferences-form";
import { Card } from "@/components/ui/card";
import { requireAgencyContext } from "@/server/auth/context";
import { getNotificationPreferences } from "@/server/queries/notifications";

/**
 * NOTIFICATION PREFERENCES — §3.11.
 *
 * ⚠️ THE DEFAULTS RENDERED HERE MATCH WHAT THE DISPATCHER RESOLVES for a type
 * with no saved row (`worker/src/jobs/notification.job.ts`). Two different
 * default sets would mean the settings page describes alerts the user is not
 * actually receiving — a lie that only surfaces when something goes wrong and
 * nobody was told.
 */
export default async function NotificationSettingsPage() {
  const ctx = await requireAgencyContext();
  const saved = await getNotificationPreferences(ctx);
  const byType = new Map(saved.map((row) => [row.type, row]));

  const rows = (Object.keys(NOTIFICATION_TYPE_LABEL) as NotificationType[]).map((type) => {
    const existing = byType.get(type);
    return {
      type,
      inApp: existing?.inApp ?? true,
      email: existing?.email ?? DEFAULT_TRIGGER_TYPES.includes(type),
      digest: (existing?.digest ?? "IMMEDIATE") as DigestFrequency,
    };
  });

  return (
    <div className="flex flex-col gap-5">
      <Card className="p-4">
        <p className="text-small text-muted-foreground">
          {t("notificationSettings.subtitle")}
        </p>
      </Card>
      <NotificationPreferencesForm initial={rows} />
    </div>
  );
}
