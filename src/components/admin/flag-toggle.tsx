"use client";

import { useState } from "react";
import { t } from "@pdm/shared/copy";
import { Button } from "@/components/ui/button";

/**
 * FLAG TOGGLE — PLAN.md §3.12, §11.13.
 *
 * ⚠️ TURNING A KILL SWITCH **OFF** IS THE SAFE DIRECTION AND NEEDS NO
 * CONFIRMATION. That is the whole point of a kill switch: at 3am, with AI spend
 * running away or the scanner melting, the operator must be one click from
 * stopping it. A confirmation dialog on the emergency stop is a design mistake
 * that costs minutes when minutes are the thing you do not have.
 *
 * Turning one back ON re-enables the behaviour that was stopped, so that
 * direction asks — briefly, inline, without a modal.
 */
export function FlagToggle({
  flagKey,
  enabled,
  rolloutPercent,
  isKillSwitch,
  action,
}: {
  flagKey: string;
  enabled: boolean;
  rolloutPercent: number;
  isKillSwitch: boolean;
  action: (formData: FormData) => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const turningOn = !enabled;

  if (isKillSwitch && turningOn && !confirming) {
    return (
      <Button variant="secondary" size="sm" onClick={() => setConfirming(true)}>
        {t("admin.flagOn")}
      </Button>
    );
  }

  return (
    <form action={action} className="inline-flex items-center gap-2">
      <input type="hidden" name="key" value={flagKey} />
      <input type="hidden" name="enabled" value={String(turningOn)} />
      <input type="hidden" name="rolloutPercentage" value={String(rolloutPercent)} />
      {confirming ? (
        <span className="text-caption text-warning">Re-enable?</span>
      ) : null}
      <Button type="submit" variant={turningOn ? "secondary" : "danger"} size="sm">
        {turningOn ? t("admin.flagOn") : t("admin.flagOff")}
      </Button>
    </form>
  );
}
