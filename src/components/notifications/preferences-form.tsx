"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { DigestFrequency, NotificationType } from "@pdm/schemas";
import { t } from "@pdm/shared/copy";
import { DIGEST_LABEL, NOTIFICATION_TYPE_LABEL } from "@pdm/shared/copy/labels";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { updateNotificationPreferences } from "@/server/actions/notifications";

/**
 * PER-TYPE NOTIFICATION PREFERENCES — §3.11.
 *
 * ⚠️ THE IN-APP COLUMN HAS NO FREQUENCY. §6.6: in-app is always immediate,
 * because it is free and non-intrusive; the digest setting applies to email
 * only. Offering "daily in-app" would imply we hold notifications back from the
 * notification centre, which we never do.
 *
 * ⚠️ A TYPE WITH NO SAVED ROW IS NOT OFF — it is "never chosen", and the
 * defaults below match what the dispatcher resolves. Rendering an unset type as
 * unchecked would tell a user they had opted out of alerts they are in fact
 * receiving.
 */

export interface PreferenceRow {
  type: NotificationType;
  inApp: boolean;
  email: boolean;
  digest: DigestFrequency;
}

export function NotificationPreferencesForm({
  initial,
}: {
  initial: PreferenceRow[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);

  const update = (type: NotificationType, patch: Partial<PreferenceRow>) => {
    setSaved(false);
    setRows(rows.map((row) => (row.type === type ? { ...row, ...patch } : row)));
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="max-md:hidden overflow-x-auto">
          <table className="w-full border-collapse text-small">
            <caption className="sr-only">{t("notificationSettings.title")}</caption>
            <thead>
              <tr>
                <th className="w-full px-4 py-2.5 text-start text-caption font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("notificationSettings.columnType")}
                </th>
                <th className="whitespace-nowrap px-4 py-2.5 text-caption font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("notificationSettings.columnInApp")}
                </th>
                <th className="whitespace-nowrap px-4 py-2.5 text-caption font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("notificationSettings.columnEmail")}
                </th>
                <th className="whitespace-nowrap px-4 py-2.5 text-start text-caption font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("notificationSettings.columnDigest")}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.type} className="border-t border-border">
                  <td className="px-4 py-3">{NOTIFICATION_TYPE_LABEL[row.type]}</td>
                  <td className="px-4 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={row.inApp}
                      aria-label={`${NOTIFICATION_TYPE_LABEL[row.type]} — ${t("notificationSettings.columnInApp")}`}
                      onChange={(event) => update(row.type, { inApp: event.target.checked })}
                      className="size-4 accent-primary"
                    />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={row.email}
                      aria-label={`${NOTIFICATION_TYPE_LABEL[row.type]} — ${t("notificationSettings.columnEmail")}`}
                      onChange={(event) => update(row.type, { email: event.target.checked })}
                      className="size-4 accent-primary"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={row.digest}
                      disabled={!row.email}
                      aria-label={`${NOTIFICATION_TYPE_LABEL[row.type]} — ${t("notificationSettings.columnDigest")}`}
                      onChange={(event) =>
                        update(row.type, { digest: event.target.value as DigestFrequency })
                      }
                      className="h-8 rounded-md border border-border bg-background px-2 text-caption disabled:opacity-50"
                    >
                      {Object.entries(DIGEST_LABEL).map(([digest, label]) => (
                        <option key={digest} value={digest}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Below md the matrix becomes a stack — a four-column grid of
            checkboxes on a 390px screen is unusable (§11.5). */}
        <ul className="md:hidden">
          {rows.map((row) => (
            <li key={row.type} className="border-b border-border p-4 last:border-b-0">
              <p className="font-medium">{NOTIFICATION_TYPE_LABEL[row.type]}</p>
              <div className="mt-2 flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-small">
                  <input
                    type="checkbox"
                    checked={row.inApp}
                    onChange={(event) => update(row.type, { inApp: event.target.checked })}
                    className="size-4 accent-primary"
                  />
                  {t("notificationSettings.columnInApp")}
                </label>
                <label className="flex items-center gap-2 text-small">
                  <input
                    type="checkbox"
                    checked={row.email}
                    onChange={(event) => update(row.type, { email: event.target.checked })}
                    className="size-4 accent-primary"
                  />
                  {t("notificationSettings.columnEmail")}
                </label>
                <select
                  value={row.digest}
                  disabled={!row.email}
                  aria-label={t("notificationSettings.columnDigest")}
                  onChange={(event) =>
                    update(row.type, { digest: event.target.value as DigestFrequency })
                  }
                  className="h-9 rounded-md border border-border bg-background px-2 text-small disabled:opacity-50"
                >
                  {Object.entries(DIGEST_LABEL).map(([digest, label]) => (
                    <option key={digest} value={digest}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <p className="text-small text-muted-foreground">
        {t("notificationSettings.digestNote")}
      </p>

      {saved ? (
        <p role="status" className="text-small text-success">
          {t("notificationSettings.saved")}
        </p>
      ) : null}

      <div>
        <Button
          variant="primary"
          disabled={pending}
          onClick={() =>
            start(async () => {
              await updateNotificationPreferences({ preferences: rows });
              setSaved(true);
              router.refresh();
            })
          }
        >
          {pending ? t("alerts.saving") : t("notificationSettings.save")}
        </Button>
      </div>
    </div>
  );
}
