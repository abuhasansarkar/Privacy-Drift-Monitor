"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { t } from "@pdm/shared/copy";
import { updatePortalSettings } from "@/server/actions/portal";

export function PortalSettingsForm({
  initial,
}: {
  initial: { name: string | null; notifyReports: boolean; notifyCriticalAlerts: boolean };
}) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        setSaved(false);
        start(async () => {
          await updatePortalSettings(value);
          setSaved(true);
          router.refresh();
        });
      }}
      className="flex max-w-md flex-col gap-4"
    >
      <label className="block">
        <span className="mb-1 block text-[14px] font-medium text-muted-foreground">
          {t("portal.settingsName")}
        </span>
        <input
          value={value.name ?? ""}
          onChange={(event) => setValue({ ...value, name: event.target.value || null })}
          className="h-11 w-full rounded-md border border-border bg-background px-3 text-[16px]"
        />
      </label>

      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={value.notifyReports}
          onChange={(event) => setValue({ ...value, notifyReports: event.target.checked })}
          className="mt-1 size-4 accent-primary"
        />
        <span>{t("portal.settingsNotifyReports")}</span>
      </label>

      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={value.notifyCriticalAlerts}
          onChange={(event) =>
            setValue({ ...value, notifyCriticalAlerts: event.target.checked })
          }
          className="mt-1 size-4 accent-primary"
        />
        <span>{t("portal.settingsNotifyCritical")}</span>
      </label>

      {saved ? (
        <p role="status" className="text-success">
          {t("portal.settingsSaved")}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-11 w-fit items-center justify-center rounded-md border border-transparent bg-primary px-4 text-[15px] font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
      >
        {t("portal.settingsSave")}
      </button>
    </form>
  );
}
