"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { t } from "@pdm/shared/copy";
import { Button } from "@/components/ui/button";
import { revokeIgnoreRule } from "@/server/actions/ignore-rules";

/**
 * ⚠️ No confirmation dialog, deliberately. Revoking is the SAFE direction: the
 * finding comes back on the next scan if the behaviour is still there, and
 * nothing is lost if it is not. Confirmations belong on the destructive
 * direction — which is the ignore itself, and that one demands a typed reason.
 */
export function RevokeIgnoreButton({ ruleId }: { ruleId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <span className="flex flex-col items-end gap-1">
      <Button
        variant="secondary"
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const outcome = await revokeIgnoreRule({ ruleId });
            if (!outcome.ok) setError(outcome.message);
            else router.refresh();
          })
        }
      >
        {pending ? t("ignored.revoking") : t("ignored.revoke")}
      </Button>
      {error ? (
        <span role="alert" className="text-caption text-danger">
          {error}
        </span>
      ) : null}
    </span>
  );
}
