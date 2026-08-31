"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { t } from "@pdm/shared/copy";
import {
  DIGEST_LABEL,
  NOTIFICATION_TYPE_LABEL,
  SEVERITY_LABEL,
} from "@pdm/shared/copy/labels";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  createAlertRule,
  deleteAlertRule,
  toggleAlertRule,
  updateAlertRule,
} from "@/server/actions/alerts";

/**
 * ALERT RULE EDITOR — §3.11, UI_DESIGN_PROMPTS §5.21.
 *
 * ⚠️ THE FORM IS THE ONLY PLACE THAT KNOWS THE SHAPE OF A RULE, and it posts
 * the whole rule rather than a patch. A partial update through a form with
 * eleven fields is how "I only changed the name" silently resets quiet hours.
 *
 * ⚠️ EVERY FAILURE IS RENDERED INLINE, never thrown. §6.3: a thrown error in a
 * Server Action trips the nearest boundary and replaces the form — including
 * everything the user typed into it.
 */

export interface ScopeOption {
  id: string;
  label: string;
}

export interface RuleValue {
  id?: string;
  name: string;
  enabled: boolean;
  scopeType: "ALL" | "GROUP" | "CLIENT" | "WEBSITE";
  scopeId: string | null;
  triggerTypes: string[];
  minSeverity: string;
  channels: string[];
  digest: string;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  criticalOverridesQuietHours: boolean;
  recipients: string[];
}

const EMPTY: RuleValue = {
  name: "",
  enabled: true,
  scopeType: "ALL",
  scopeId: null,
  // The §6.6 starter set: narrow on purpose. A default that alerts on
  // everything trains people to mute us in week one.
  triggerTypes: ["CRITICAL_ISSUE", "CONSENT_REGRESSION", "NEW_TRACKER"],
  minSeverity: "HIGH",
  channels: ["email", "in_app"],
  digest: "IMMEDIATE",
  quietHoursStart: null,
  quietHoursEnd: null,
  criticalOverridesQuietHours: true,
  recipients: [],
};

export function AlertRuleForm({
  initial,
  clients,
  websites,
  groups,
  timezone,
  onDone,
}: {
  initial?: RuleValue;
  clients: ScopeOption[];
  websites: ScopeOption[];
  groups: ScopeOption[];
  timezone: string;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [value, setValue] = useState<RuleValue>(initial ?? EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const scopeOptions =
    value.scopeType === "CLIENT"
      ? clients
      : value.scopeType === "WEBSITE"
        ? websites
        : value.scopeType === "GROUP"
          ? groups
          : [];

  const quietHoursOn = value.quietHoursStart !== null && value.quietHoursEnd !== null;

  const submit = () => {
    setError(null);
    start(async () => {
      const payload = {
        name: value.name,
        enabled: value.enabled,
        scopeType: value.scopeType,
        scopeId: value.scopeType === "ALL" ? null : value.scopeId,
        triggerTypes: value.triggerTypes as never,
        minSeverity: value.minSeverity as never,
        channels: value.channels as never,
        digest: value.digest as never,
        quietHoursStart: value.quietHoursStart,
        quietHoursEnd: value.quietHoursEnd,
        criticalOverridesQuietHours: value.criticalOverridesQuietHours,
        recipients: value.recipients,
      };

      const result = value.id
        ? await updateAlertRule({ id: value.id, rule: payload })
        : await createAlertRule(payload);

      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.refresh();
      onDone?.();
    });
  };

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-col gap-4">
        <Field label={t("alerts.nameLabel")}>
          <input
            value={value.name}
            onChange={(event) => setValue({ ...value, name: event.target.value })}
            placeholder={t("alerts.namePlaceholder")}
            className={INPUT}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("alerts.scopeLabel")}>
            <select
              value={value.scopeType}
              onChange={(event) =>
                setValue({
                  ...value,
                  scopeType: event.target.value as RuleValue["scopeType"],
                  // Clearing the target on a scope change is deliberate: a
                  // client id left behind on a WEBSITE-scoped rule would match
                  // nothing and the rule would silently never fire.
                  scopeId: null,
                })
              }
              className={INPUT}
            >
              <option value="ALL">{t("alerts.scopeAll")}</option>
              <option value="CLIENT">{t("alerts.scopeClient")}</option>
              <option value="WEBSITE">{t("alerts.scopeWebsite")}</option>
              <option value="GROUP">{t("alerts.scopeGroup")}</option>
            </select>
          </Field>

          {value.scopeType !== "ALL" ? (
            <Field label={t("alerts.scopeTargetLabel")}>
              <select
                value={value.scopeId ?? ""}
                onChange={(event) =>
                  setValue({ ...value, scopeId: event.target.value || null })
                }
                className={INPUT}
              >
                <option value="">—</option>
                {scopeOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
        </div>

        <Field label={t("alerts.triggerTypesLabel")}>
          <div className="flex flex-wrap gap-2">
            {Object.entries(NOTIFICATION_TYPE_LABEL).map(([type, label]) => (
              <Toggle
                key={type}
                active={value.triggerTypes.includes(type)}
                onClick={() =>
                  setValue({
                    ...value,
                    triggerTypes: value.triggerTypes.includes(type)
                      ? value.triggerTypes.filter((item) => item !== type)
                      : [...value.triggerTypes, type],
                  })
                }
              >
                {label}
              </Toggle>
            ))}
          </div>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("alerts.minSeverityLabel")}>
            <select
              value={value.minSeverity}
              onChange={(event) => setValue({ ...value, minSeverity: event.target.value })}
              className={INPUT}
            >
              {Object.entries(SEVERITY_LABEL).map(([severity, label]) => (
                <option key={severity} value={severity}>
                  {label}
                </option>
              ))}
            </select>
          </Field>

          <Field label={t("alerts.scheduleLabel")}>
            <select
              value={value.digest}
              onChange={(event) => setValue({ ...value, digest: event.target.value })}
              className={INPUT}
            >
              {Object.entries(DIGEST_LABEL).map(([digest, label]) => (
                <option key={digest} value={digest}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label={t("alerts.channelsLabel")}>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["in_app", t("alerts.channelInApp")],
                ["email", t("alerts.channelEmail")],
              ] as const
            ).map(([channel, label]) => (
              <Toggle
                key={channel}
                active={value.channels.includes(channel)}
                onClick={() =>
                  setValue({
                    ...value,
                    channels: value.channels.includes(channel)
                      ? value.channels.filter((item) => item !== channel)
                      : [...value.channels, channel],
                  })
                }
              >
                {label}
              </Toggle>
            ))}
          </div>
        </Field>

        <fieldset className="rounded-md border border-border p-3">
          <legend className="px-1 text-caption font-semibold uppercase tracking-wide text-muted-foreground">
            {t("alerts.quietHoursLabel")}
          </legend>
          <p className="mb-3 text-small text-muted-foreground">
            {t("alerts.quietHoursHelp")}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("alerts.quietHoursStart")}>
              <input
                type="time"
                value={value.quietHoursStart ?? ""}
                onChange={(event) =>
                  setValue({ ...value, quietHoursStart: event.target.value || null })
                }
                className={INPUT}
              />
            </Field>
            <Field label={t("alerts.quietHoursEnd")}>
              <input
                type="time"
                value={value.quietHoursEnd ?? ""}
                onChange={(event) =>
                  setValue({ ...value, quietHoursEnd: event.target.value || null })
                }
                className={INPUT}
              />
            </Field>
          </div>
          <p className="mt-2 font-mono text-mono text-muted-foreground">
            {t("alerts.quietHoursTimezoneNote")} {timezone}
          </p>

          {quietHoursOn ? (
            <label className="mt-3 flex items-start gap-2 text-small">
              <input
                type="checkbox"
                checked={value.criticalOverridesQuietHours}
                onChange={(event) =>
                  setValue({
                    ...value,
                    criticalOverridesQuietHours: event.target.checked,
                  })
                }
                className="mt-0.5 size-4 accent-primary"
              />
              <span>
                {t("alerts.criticalOverrideLabel")}
                <span className="block text-caption text-muted-foreground">
                  {t("alerts.criticalOverrideHelp")}
                </span>
              </span>
            </label>
          ) : null}
        </fieldset>

        <Field label={t("alerts.recipientsLabel")}>
          <textarea
            rows={2}
            value={value.recipients.join("\n")}
            onChange={(event) =>
              setValue({
                ...value,
                recipients: event.target.value
                  .split("\n")
                  .map((line) => line.trim())
                  .filter(Boolean),
              })
            }
            className={INPUT}
          />
          <p className="mt-1 text-caption text-muted-foreground">
            {t("alerts.recipientsHelp")}
          </p>
        </Field>

        {error ? (
          <p role="alert" className="text-small text-danger">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={submit} disabled={pending}>
            {pending ? t("alerts.saving") : t("alerts.save")}
          </Button>
          {onDone ? (
            <Button variant="ghost" onClick={onDone} disabled={pending}>
              {t("common.cancel")}
            </Button>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

const INPUT =
  "h-9 w-full rounded-md border border-border bg-background px-2.5 text-small max-sm:h-11";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-caption font-medium text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

function Toggle({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={
        active
          ? "rounded-md border border-primary bg-primary/10 px-2.5 py-1 text-caption font-medium text-primary"
          : "rounded-md border border-border px-2.5 py-1 text-caption text-muted-foreground hover:text-foreground"
      }
    >
      {children}
    </button>
  );
}

/** Enable/disable and delete, for a row in the rules table. */
export function RuleRowActions({
  id,
  enabled,
  onEdit,
}: {
  id: string;
  enabled: boolean;
  onEdit: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <span className="flex items-center justify-end gap-2">
      <Button size="sm" variant="ghost" onClick={onEdit} disabled={pending}>
        {t("common.edit")}
      </Button>
      <label className="flex items-center gap-1.5 text-caption text-muted-foreground">
        <input
          type="checkbox"
          checked={enabled}
          disabled={pending}
          onChange={(event) =>
            start(async () => {
              await toggleAlertRule({ id, enabled: event.target.checked });
              router.refresh();
            })
          }
          className="size-4 accent-primary"
        />
        {t("alerts.enabledLabel")}
      </label>
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() => {
          // A rule deletion silences alerts with no visible symptom, so it
          // confirms — the one destructive action on this page.
          if (!window.confirm(t("alerts.deleteConfirm"))) return;
          start(async () => {
            await deleteAlertRule({ id });
            router.refresh();
          });
        }}
      >
        {t("common.delete")}
      </Button>
    </span>
  );
}
