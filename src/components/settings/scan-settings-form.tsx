"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { ScanFrequency, ScanPriority } from "@pdm/schemas";
import { t } from "@pdm/shared/copy";
import { FREQUENCY_LABEL } from "@pdm/shared/copy/labels";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { saveScanSettings } from "@/server/actions/scan-settings";

/**
 * SCAN SETTINGS — §3.11, UI_DESIGN_PROMPTS §5.27 (the standard settings
 * template: bordered form cards, a sticky bottom action bar).
 *
 * ⚠️ `respectRobots` IS A TOGGLE WITH A WARNING, not a bare switch. Turning it
 * off means scanning a site that asked us not to — the help text says exactly
 * that, because the consequence lands on somebody else's server.
 */

export interface ScanSettingsValue {
  defaultFrequency: ScanFrequency;
  defaultPageLimit: number;
  defaultPriority: ScanPriority;
  screenshotPolicy: "ALWAYS" | "ON_CHANGE" | "NEVER";
  respectRobots: boolean;
  userAgentSuffix: string | null;
  ignoredDomains: string[];
  evidenceRetentionDays: number | null;
}

export function ScanSettingsForm({ initial }: { initial: ScanSettingsValue }) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = JSON.stringify(value) !== JSON.stringify(initial);

  const submit = () => {
    setError(null);
    setSaved(false);
    start(async () => {
      const result = await saveScanSettings(value);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader title={t("scanSettings.defaultsTitle")} />
        <div className="grid gap-4 p-4 sm:grid-cols-2">
          <p className="text-small text-muted-foreground sm:col-span-2">
            {t("scanSettings.defaultsBody")}
          </p>

          <Field label={t("scanSettings.frequency")}>
            <select
              value={value.defaultFrequency}
              onChange={(event) =>
                setValue({
                  ...value,
                  defaultFrequency: event.target.value as ScanFrequency,
                })
              }
              className={INPUT}
            >
              {Object.entries(FREQUENCY_LABEL).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </Field>

          <Field label={t("scanSettings.priority")}>
            <select
              value={value.defaultPriority}
              onChange={(event) =>
                setValue({ ...value, defaultPriority: event.target.value as ScanPriority })
              }
              className={INPUT}
            >
              {(["LOW", "NORMAL", "HIGH"] as const).map((priority) => (
                <option key={priority} value={priority}>
                  {priority[0] + priority.slice(1).toLowerCase()}
                </option>
              ))}
            </select>
          </Field>

          <Field label={t("scanSettings.pageLimit")} help={t("scanSettings.pageLimitHelp")}>
            <input
              type="number"
              min={1}
              max={20}
              value={value.defaultPageLimit}
              onChange={(event) =>
                setValue({ ...value, defaultPageLimit: Number(event.target.value) })
              }
              className={INPUT}
            />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader title={t("scanSettings.behaviourTitle")} />
        <div className="flex flex-col gap-4 p-4">
          <Field
            label={t("scanSettings.screenshotPolicy")}
            help={t("scanSettings.screenshotHelp")}
          >
            <select
              value={value.screenshotPolicy}
              onChange={(event) =>
                setValue({
                  ...value,
                  screenshotPolicy: event.target
                    .value as ScanSettingsValue["screenshotPolicy"],
                })
              }
              className={INPUT}
            >
              <option value="ALWAYS">{t("scanSettings.screenshotAlways")}</option>
              <option value="ON_CHANGE">{t("scanSettings.screenshotOnChange")}</option>
              <option value="NEVER">{t("scanSettings.screenshotNever")}</option>
            </select>
          </Field>

          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={value.respectRobots}
              onChange={(event) =>
                setValue({ ...value, respectRobots: event.target.checked })
              }
              className="mt-1 size-4 accent-primary"
            />
            <span>
              <span className="block text-small font-medium">
                {t("scanSettings.respectRobots")}
              </span>
              <span className="block text-caption text-muted-foreground">
                {t("scanSettings.respectRobotsHelp")}
              </span>
            </span>
          </label>

          <Field
            label={t("scanSettings.userAgentSuffix")}
            help={t("scanSettings.userAgentSuffixHelp")}
          >
            <input
              value={value.userAgentSuffix ?? ""}
              onChange={(event) =>
                setValue({ ...value, userAgentSuffix: event.target.value || null })
              }
              className={`${INPUT} font-mono`}
            />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader title={t("scanSettings.retentionTitle")} />
        <div className="flex flex-col gap-3 p-4">
          <Field label={t("scanSettings.retentionLabel")} help={t("scanSettings.retentionHelp")}>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="number"
                min={7}
                max={365}
                // Empty means "use the plan's limit", which is the default and
                // the only value most agencies should have.
                value={value.evidenceRetentionDays ?? ""}
                placeholder={t("scanSettings.retentionPlanDefault")}
                onChange={(event) =>
                  setValue({
                    ...value,
                    evidenceRetentionDays: event.target.value
                      ? Number(event.target.value)
                      : null,
                  })
                }
                className={`${INPUT} max-w-[10rem]`}
              />
              <span className="text-small text-muted-foreground">
                {t("scanSettings.retentionDays")}
              </span>
            </div>
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader title={t("scanSettings.ignoredTitle")} />
        <div className="p-4">
          <Field label={t("scanSettings.ignoredTitle")} help={t("scanSettings.ignoredHelp")}>
            <textarea
              rows={4}
              value={value.ignoredDomains.join("\n")}
              onChange={(event) =>
                setValue({
                  ...value,
                  ignoredDomains: event.target.value
                    .split("\n")
                    .map((line) => line.trim().toLowerCase())
                    .filter(Boolean),
                })
              }
              className={`${INPUT} h-auto font-mono`}
            />
          </Field>
        </div>
      </Card>

      {error ? (
        <p role="alert" className="text-small text-danger">
          {error}
        </p>
      ) : null}
      {saved ? (
        <p role="status" className="text-small text-success">
          {t("scanSettings.saved")}
        </p>
      ) : null}

      {/* §5.27's sticky bottom action bar. */}
      <div className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t border-border bg-background/90 py-3 backdrop-blur">
        <Button variant="ghost" onClick={() => setValue(initial)} disabled={pending || !dirty}>
          {t("branding.discard")}
        </Button>
        <Button variant="primary" onClick={submit} disabled={pending || !dirty}>
          {pending ? t("scanSettings.saving") : t("scanSettings.save")}
        </Button>
      </div>
    </div>
  );
}

const INPUT =
  "h-9 w-full rounded-md border border-border bg-background px-2.5 text-small max-sm:h-11";

function Field({
  label,
  help,
  children,
}: {
  label: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-caption font-medium text-muted-foreground">
        {label}
      </span>
      {children}
      {help ? (
        <span className="mt-1 block text-caption text-muted-foreground">{help}</span>
      ) : null}
    </label>
  );
}
