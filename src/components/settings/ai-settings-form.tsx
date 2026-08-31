"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { t } from "@pdm/shared/copy";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { AlertTriangleIcon } from "@/components/ui/icons";
import { saveAiSettings, type AiSettingsInput } from "@/server/actions/ai-settings";

/**
 * AI SETTINGS FORM — PLAN.md Part VIII §8.3, §8.9, Phase 5 task 5.8.
 *
 * ⚠️ `autoExplainCritical` CARRIES A WARNING, not a bare switch — the same
 * treatment `respectRobots` gets in the scan settings, and for the same reason:
 * the consequence is not obvious from the label. Feature doc 16's trap list
 * calls it "the main uncontrolled cost vector", because it spends credits on
 * issues nobody has opened. The help text says so in the words a person
 * approving a budget would use.
 *
 * ⚠️ THE CREDIT CAP IS ALLOWED TO BE ZERO, and 0 is not "no cap". "Spend
 * nothing this period" is a real, useful setting — a falsy check that folded it
 * into `null` would turn the strictest cap into no cap at all, which is the
 * single most expensive off-by-one available here. Empty means no cap; 0 means
 * zero.
 */

export function AiSettingsForm({ initial }: { initial: AiSettingsInput }) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = JSON.stringify(value) !== JSON.stringify(initial);

  function submit() {
    setError(null);
    setSaved(false);
    start(async () => {
      const result = await saveAiSettings(value);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader title={t("aiSettings.featuresTitle")} />
        <div className="flex flex-col gap-4 p-4">
          <p className="text-small text-muted-foreground">
            {t("aiSettings.featuresBody")}
          </p>

          <Toggle
            checked={value.aiEnabled}
            onChange={(next) => setValue({ ...value, aiEnabled: next })}
            label={t("aiSettings.enable")}
            help={t("aiSettings.enableHelp")}
          />

          <Toggle
            checked={value.autoExplainCritical}
            onChange={(next) => setValue({ ...value, autoExplainCritical: next })}
            label={t("aiSettings.autoExplain")}
            help={t("aiSettings.autoExplainHelp")}
            disabled={!value.aiEnabled}
            warning={value.autoExplainCritical}
          />
        </div>
      </Card>

      <Card>
        <CardHeader title={t("aiSettings.costTitle")} />
        <div className="grid gap-4 p-4 sm:grid-cols-2">
          <p className="text-small text-muted-foreground sm:col-span-2">
            {t("aiSettings.costBody")}
          </p>

          <label className="flex flex-col gap-1.5">
            <span className="text-small font-medium">{t("aiSettings.modelTier")}</span>
            <select
              value={value.modelTier}
              onChange={(event) =>
                setValue({
                  ...value,
                  modelTier: event.target.value as "STANDARD" | "ADVANCED",
                })
              }
              className="h-9 rounded-md border border-input bg-background px-3 text-small"
            >
              <option value="STANDARD">{t("aiSettings.tierStandard")}</option>
              <option value="ADVANCED">{t("aiSettings.tierAdvanced")}</option>
            </select>
            <span className="text-caption text-muted-foreground">
              {t("aiSettings.modelTierHelp")}
            </span>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-small font-medium">{t("aiSettings.creditCap")}</span>
            <input
              type="number"
              min={0}
              inputMode="numeric"
              value={value.monthlyCreditCap ?? ""}
              onChange={(event) =>
                setValue({
                  ...value,
                  // ⚠️ EMPTY → null (no cap). "0" → 0 (spend nothing). The
                  // explicit `=== ""` is what keeps those two apart; `Number("")`
                  // is 0, so a falsy test here would silently create a cap.
                  monthlyCreditCap:
                    event.target.value === "" ? null : Number(event.target.value),
                })
              }
              placeholder={t("aiSettings.creditCapPlaceholder")}
              className="h-9 rounded-md border border-input bg-background px-3 text-small"
            />
            <span className="text-caption text-muted-foreground">
              {t("aiSettings.creditCapHelp")}
            </span>
          </label>
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" onClick={submit} disabled={pending || !dirty}>
          {pending ? t("scanSettings.saving") : t("common.save")}
        </Button>
        {saved ? (
          <span className="text-small text-success">{t("scanSettings.saved")}</span>
        ) : null}
        {error ? <span className="text-small text-danger">{error}</span> : null}
      </div>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  help,
  disabled,
  warning,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  help: string;
  disabled?: boolean;
  /** Renders the help text as a warning — colour PLUS icon PLUS text (§11.6). */
  warning?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="inline-flex items-center gap-2.5 text-small font-medium">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
        />
        {label}
      </label>
      <span
        className={
          warning
            ? "flex items-start gap-1.5 ps-6 text-caption text-warning"
            : "ps-6 text-caption text-muted-foreground"
        }
      >
        {warning ? <AlertTriangleIcon className="mt-0.5" /> : null}
        {help}
      </span>
    </div>
  );
}
