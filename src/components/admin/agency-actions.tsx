"use client";

import { useState } from "react";
import { t } from "@pdm/shared/copy";
import { Button } from "@/components/ui/button";
import { AlertTriangleIcon } from "@/components/ui/icons";

/**
 * AGENCY SUPPORT ACTIONS — PLAN.md §3.12, Phase 6 task 6.6.
 *
 * ⚠️ EVERY ACTION HERE ASKS FOR A REASON BEFORE IT WILL SUBMIT, and the server
 * requires one too (min 8 characters, recorded). This is not a formality: these
 * five actions change what a paying customer can do, and "why was this agency
 * suspended on 3 March" is a question that gets asked months later by someone
 * who was not in the room.
 *
 * ⚠️ IMPERSONATE CARRIES ITS OWN WARNING, ABOVE THE FIELD. §3.12 wants the
 * operator to see the consequence while they are typing the reason, not after.
 */

type ActionKey = "suspend" | "reactivate" | "extendTrial" | "grantCredits" | "impersonate";

export function AgencyActions({
  agencyId,
  status,
  actions,
}: {
  agencyId: string;
  status: string;
  actions: Record<ActionKey, (formData: FormData) => Promise<void>>;
}) {
  const [open, setOpen] = useState<ActionKey | null>(null);

  const available: Array<{ key: ActionKey; label: string; danger?: boolean }> = [
    status === "ACTIVE"
      ? { key: "suspend", label: t("admin.agencySuspend"), danger: true }
      : { key: "reactivate", label: t("admin.agencyReactivate") },
    { key: "extendTrial", label: t("admin.agencyExtendTrial") },
    { key: "grantCredits", label: t("admin.agencyGrantCredits") },
    { key: "impersonate", label: t("admin.agencyImpersonate"), danger: true },
  ];

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap gap-2">
        {available.map((entry) => (
          <Button
            key={entry.key}
            variant={entry.danger ? "danger" : "secondary"}
            size="sm"
            onClick={() => setOpen(open === entry.key ? null : entry.key)}
          >
            {entry.label}
          </Button>
        ))}
      </div>

      {open ? (
        <form
          action={actions[open]}
          className="flex flex-col gap-2 rounded-md border border-border bg-background p-3"
        >
          <input type="hidden" name="agencyId" value={agencyId} />

          {open === "impersonate" ? (
            <p className="flex items-start gap-2 text-caption text-warning">
              <AlertTriangleIcon className="mt-0.5 shrink-0" />
              {t("admin.agencyImpersonateWarning")}
            </p>
          ) : null}

          {open === "grantCredits" ? (
            <label className="flex flex-col gap-1 text-caption">
              Credits
              <input
                name="credits"
                type="number"
                min={1}
                max={100000}
                defaultValue={100}
                required
                className="h-8 w-32 rounded-md border border-border bg-background px-2 text-small"
              />
            </label>
          ) : null}

          <label className="flex flex-col gap-1 text-caption">
            {t("admin.agencyImpersonateReason")}
            <input
              name="reason"
              required
              minLength={8}
              maxLength={500}
              className="h-8 w-full rounded-md border border-border bg-background px-2 text-small"
            />
          </label>

          <div className="flex gap-2">
            <Button type="submit" variant="primary" size="sm">
              Confirm
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(null)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
