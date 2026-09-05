"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ShieldIcon } from "@/components/ui/icons";
import { ROLE_LABEL } from "@/lib/labels";
import type { AgencyRole } from "@pdm/shared/permissions";
import { acceptTeamInvitation } from "@/server/actions/team";

export function AcceptInvitationCard({
  token,
  agencyName,
  role,
  inviterName,
  userEmail,
}: {
  token: string;
  agencyName: string;
  role: AgencyRole;
  inviterName: string;
  userEmail: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleAccept() {
    setError(null);
    start(async () => {
      const result = await acceptTeamInvitation({ token });
      if (!result.ok) {
        setError(result.message);
      } else {
        router.push("/app");
        router.refresh();
      }
    });
  }

  return (
    <Card className="flex w-full max-w-md flex-col items-center p-6 text-center shadow-lg">
      <div className="mb-4 grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
        <ShieldIcon />
      </div>

      <h1 className="text-h3">Join {agencyName}</h1>
      <p className="mt-2 text-small text-muted-foreground">
        <strong>{inviterName}</strong> has invited you to join{" "}
        <strong>{agencyName}</strong> on Privacy Drift Monitor.
      </p>

      <div className="my-5 flex w-full flex-col gap-2 rounded-lg border border-border bg-muted/40 p-3 text-small">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Role</span>
          <span className="font-semibold text-foreground">{ROLE_LABEL[role]}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Account</span>
          <span className="font-medium text-foreground">{userEmail}</span>
        </div>
      </div>

      {error ? (
        <div
          role="alert"
          className="mb-4 w-full rounded-md border border-danger/20 bg-danger/10 p-3 text-small text-danger text-left"
        >
          {error}
        </div>
      ) : null}

      <Button
        variant="primary"
        size="md"
        className="w-full justify-center"
        disabled={pending}
        onClick={handleAccept}
      >
        {pending ? "Joining team..." : "Accept & Join Agency"}
      </Button>
    </Card>
  );
}
