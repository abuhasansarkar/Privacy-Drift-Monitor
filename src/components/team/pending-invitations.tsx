"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { t } from "@pdm/shared/copy";
import type { AgencyRole } from "@pdm/shared/permissions";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { ROLE_LABEL } from "@/lib/labels";
import { formatDate } from "@/lib/format";
import { resendInvitation, revokeInvitation } from "@/server/actions/team";

export interface PendingInviteItem {
  id: string;
  email: string;
  role: AgencyRole;
  inviteUrl: string;
  createdAt: Date;
  expiresAt: Date;
  deliveryStatus?: string | null;
  deliveryError?: string | null;
}

export function PendingInvitations({
  invitations,
  canRevoke,
  timezone,
}: {
  invitations: PendingInviteItem[];
  canRevoke: boolean;
  timezone: string;
}) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [, start] = useTransition();
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(
    null,
  );

  if (invitations.length === 0) return null;

  function handleRevoke(id: string) {
    setMessage(null);
    setPendingId(id);
    start(async () => {
      const outcome = await revokeInvitation({ invitationId: id });
      setPendingId(null);
      if (!outcome.ok) {
        setMessage({ type: "error", text: outcome.message });
      } else {
        router.refresh();
      }
    });
  }

  function handleResend(id: string) {
    setMessage(null);
    setResendingId(id);
    start(async () => {
      const outcome = await resendInvitation({ invitationId: id });
      setResendingId(null);
      if (!outcome.ok) {
        setMessage({ type: "error", text: outcome.message });
      } else {
        setMessage({
          type: "success",
          text: "Invitation reenqueued. Note: On sandbox Resend, test emails only reach the account owner. Use Copy link for other recipients.",
        });
        router.refresh();
      }
    });
  }

  function handleCopy(id: string, url: string) {
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  return (
    <Card>
      <CardHeader
        title={`${t("team.pendingInvitationsTitle")} (${invitations.length})`}
      />
      {message ? (
        <div
          role="alert"
          className={`mx-4 mt-2 rounded-md p-3 text-small ${
            message.type === "error"
              ? "bg-danger/10 text-danger"
              : "bg-success/10 text-success"
          }`}
        >
          {message.text}
        </div>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-small">
          <thead>
            <tr className="border-b border-border text-caption text-muted-foreground">
              <th className="px-4 py-3 font-medium">{t("team.columnEmail")}</th>
              <th className="px-4 py-3 font-medium">{t("team.columnRole")}</th>
              <th className="px-4 py-3 font-medium">Email Delivery</th>
              <th className="px-4 py-3 font-medium">{t("team.columnSent")}</th>
              <th className="px-4 py-3 font-medium">{t("team.columnExpires")}</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {invitations.map((inv) => (
              <tr key={inv.id}>
                <td className="px-4 py-3 font-medium">{inv.email}</td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center rounded-md border border-border px-2 py-0.5 text-caption font-medium">
                    {ROLE_LABEL[inv.role]}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {inv.deliveryStatus === "failed" ? (
                    <div className="flex flex-col gap-0.5">
                      <span className="inline-flex items-center gap-1 w-fit rounded-md border border-danger/30 bg-danger/10 px-2 py-0.5 text-caption font-medium text-danger">
                        Delivery Failed
                      </span>
                      <span
                        className="max-w-[180px] truncate text-[11px] text-muted-foreground"
                        title={inv.deliveryError || "Provider rejected delivery"}
                      >
                        {inv.deliveryError?.includes("403")
                          ? "Sandbox domain restricted"
                          : (inv.deliveryError || "Provider rejected")}
                      </span>
                    </div>
                  ) : inv.deliveryStatus === "delivered" || inv.deliveryStatus === "sent" ? (
                    <span className="inline-flex items-center rounded-md border border-success/30 bg-success/10 px-2 py-0.5 text-caption font-medium text-success">
                      {inv.deliveryStatus === "delivered" ? "Delivered" : "Sent"}
                    </span>
                  ) : inv.deliveryStatus === "simulated" ? (
                    <span className="inline-flex items-center rounded-md border border-warning/30 bg-warning/10 px-2 py-0.5 text-caption font-medium text-warning">
                      Simulated
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-md border border-border px-2 py-0.5 text-caption font-medium text-muted-foreground">
                      Queued
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  <time dateTime={inv.createdAt.toISOString()}>
                    {formatDate(inv.createdAt, timezone)}
                  </time>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  <time dateTime={inv.expiresAt.toISOString()}>
                    {formatDate(inv.expiresAt, timezone)}
                  </time>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleCopy(inv.id, inv.inviteUrl)}
                      title={t("team.copyLinkTitle")}
                    >
                      {copiedId === inv.id ? t("team.linkCopied") : t("team.copyLink")}
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={resendingId === inv.id}
                      onClick={() => handleResend(inv.id)}
                    >
                      {resendingId === inv.id ? t("team.resending") : t("team.resend")}
                    </Button>

                    {canRevoke ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={pendingId === inv.id}
                        onClick={() => handleRevoke(inv.id)}
                      >
                        {pendingId === inv.id ? t("team.revoking") : t("team.revoke")}
                      </Button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
