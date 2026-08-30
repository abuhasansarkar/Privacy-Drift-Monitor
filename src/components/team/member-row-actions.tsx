"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { AgencyRole } from "@pdm/shared/permissions";
import { t } from "@pdm/shared/copy";
import { Button } from "@/components/ui/button";
import { ROLE_LABEL } from "@/lib/labels";
import { removeMember, setMemberRole } from "@/server/actions/team";

const ROLES: AgencyRole[] = ["OWNER", "ADMIN", "MANAGER", "DEVELOPER", "VIEWER"];

/**
 * ⚠️ THE ROLE SELECT IS DISABLED FOR YOURSELF.
 *
 * Not for safety — the server would allow it — but because demoting yourself is
 * almost always a misclick, and the recovery needs another admin. The one
 * legitimate case (handing over ownership) is done by promoting the other
 * person first, which this does allow.
 */
export function MemberRowActions({
  memberId,
  role,
  isSelf,
  canChangeRole,
  canRemove,
}: {
  memberId: string;
  role: AgencyRole;
  isSelf: boolean;
  canChangeRole: boolean;
  canRemove: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <span className="flex flex-col items-end gap-1.5">
      <span className="flex items-center gap-2">
        {canChangeRole ? (
          <select
            value={role}
            disabled={pending || isSelf}
            onChange={(event) => {
              const next = event.target.value as AgencyRole;
              setError(null);
              start(async () => {
                const outcome = await setMemberRole({ memberId, role: next });
                if (!outcome.ok) setError(outcome.message);
                else router.refresh();
              });
            }}
            className="h-8 rounded-md border border-border bg-background px-2 text-small disabled:opacity-60"
          >
            {ROLES.map((candidate) => (
              <option key={candidate} value={candidate}>
                {ROLE_LABEL[candidate]}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-small text-muted-foreground">{ROLE_LABEL[role]}</span>
        )}

        {canRemove && !isSelf ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => {
              setError(null);
              start(async () => {
                const outcome = await removeMember({ memberId });
                if (!outcome.ok) setError(outcome.message);
                else router.refresh();
              });
            }}
          >
            {pending ? t("team.removing") : t("team.remove")}
          </Button>
        ) : null}
      </span>

      {error ? (
        <span role="alert" className="text-caption text-danger">
          {error}
        </span>
      ) : null}
    </span>
  );
}
