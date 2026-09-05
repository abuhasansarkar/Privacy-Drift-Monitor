"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { assignIssue } from "@/server/actions/issues";
import { UsersIcon } from "@/components/ui/icons";

export interface AssigneeUser {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
}

export interface TeamMemberOption {
  id: string;
  userId: string;
  user: AssigneeUser;
}

export function IssueAssigneeSelect({
  issueId,
  currentAssignee,
  members,
  canAssign,
}: {
  issueId: string;
  currentAssignee: AssigneeUser | null;
  members: TeamMemberOption[];
  canAssign: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const selectedUserId = currentAssignee?.id ?? "";

  const formatName = (user: AssigneeUser) =>
    [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;

  if (!canAssign) {
    return (
      <span className="inline-flex items-center gap-1.5 text-small text-muted-foreground">
        <UsersIcon />
        <span>{currentAssignee ? formatName(currentAssignee) : "Unassigned"}</span>
      </span>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="inline-flex items-center gap-1.5">
        <span className="text-muted-foreground">
          <UsersIcon />
        </span>
        <select
          value={selectedUserId}
          disabled={pending}
          onChange={(e) => {
            const nextUserId = e.target.value === "" ? null : e.target.value;
            setError(null);
            start(async () => {
              const outcome = await assignIssue({
                issueId,
                assignedToUserId: nextUserId,
              });
              if (!outcome.ok) {
                setError(outcome.message);
              } else {
                router.refresh();
              }
            });
          }}
          className="h-8 rounded-md border border-border bg-background px-2.5 text-small text-foreground disabled:opacity-60 outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="">Unassigned</option>
          {members.map((member) => (
            <option key={member.user.id} value={member.user.id}>
              {formatName(member.user)}
            </option>
          ))}
        </select>
      </div>

      {error ? (
        <span role="alert" className="text-caption text-danger">
          {error}
        </span>
      ) : null}
    </div>
  );
}
