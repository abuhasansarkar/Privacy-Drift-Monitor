"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { t } from "@pdm/shared/copy";
import type { AgencyRole } from "@pdm/shared/permissions";
import { Button } from "@/components/ui/button";
import { PlusIcon, XIcon } from "@/components/ui/icons";
import { ROLE_LABEL } from "@/lib/labels";
import { inviteMember } from "@/server/actions/team";

const ROLES: Exclude<AgencyRole, "OWNER">[] = ["ADMIN", "MANAGER", "DEVELOPER", "VIEWER"];

const ROLE_DESCRIPTIONS: Record<Exclude<AgencyRole, "OWNER">, string> = {
  ADMIN: t("team.roleHelpAdmin"),
  MANAGER: t("team.roleHelpManager"),
  DEVELOPER: t("team.roleHelpDeveloper"),
  VIEWER: t("team.roleHelpViewer"),
};

export function InviteMemberDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Exclude<AgencyRole, "OWNER">>("DEVELOPER");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function handleOpen() {
    setEmail("");
    setRole("DEVELOPER");
    setError(null);
    setSuccess(false);
    setInviteUrl(null);
    setCopied(false);
    setOpen(true);
  }

  function handleClose() {
    setOpen(false);
    setInviteUrl(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    start(async () => {
      const outcome = await inviteMember({ email, role });
      if (!outcome.ok) {
        setError(outcome.message);
      } else {
        setSuccess(true);
        setInviteUrl(outcome.data.inviteUrl);
        router.refresh();
      }
    });
  }

  return (
    <>
      <Button variant="primary" size="md" onClick={handleOpen}>
        <PlusIcon />
        {t("team.inviteMember")}
      </Button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="invite-dialog-title"
            className="w-full max-w-lg rounded-lg border border-border bg-card p-6 shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h2 id="invite-dialog-title" className="text-h4">
                {t("team.inviteMemberTitle")}
              </h2>
              <button
                type="button"
                onClick={handleClose}
                className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Close"
              >
                <XIcon />
              </button>
            </div>

            {success ? (
              <div className="flex flex-col gap-4 py-4">
                <div className="rounded-md bg-success/10 p-3 text-small text-success">
                  {t("team.inviteSuccess")}
                </div>

                {inviteUrl ? (
                  <div className="flex flex-col gap-2">
                    <p className="text-small text-muted-foreground">
                      {t("team.directLinkNotice")}
                    </p>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={inviteUrl}
                        className="h-9 w-full rounded-md border border-border bg-background px-3 text-caption font-mono outline-none"
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          navigator.clipboard.writeText(inviteUrl);
                          setCopied(true);
                          setTimeout(() => setCopied(false), 2000);
                        }}
                      >
                        {copied ? t("team.linkCopied") : t("team.copyLink")}
                      </Button>
                    </div>
                    <p className="text-[12px] text-muted-foreground">
                      Tip: If outbound email delivery is restricted on your provider sandbox domain, your colleague can join immediately using this link.
                    </p>
                  </div>
                ) : null}

                <div className="mt-2 flex justify-end">
                  <Button type="button" variant="primary" size="sm" onClick={handleClose}>
                    {t("team.done")}
                  </Button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
                {error ? (
                  <div
                    role="alert"
                    className="rounded-md border border-danger/20 bg-danger/10 p-3 text-small text-danger"
                  >
                    {error}
                  </div>
                ) : null}

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="invite-email" className="text-small font-medium">
                    {t("team.emailLabel")}
                  </label>
                  <input
                    id="invite-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t("team.emailPlaceholder")}
                    disabled={pending}
                    className="h-9 w-full rounded-md border border-border bg-background px-3 text-small outline-none focus:border-primary"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="invite-role" className="text-small font-medium">
                    {t("team.roleLabel")}
                  </label>
                  <select
                    id="invite-role"
                    value={role}
                    onChange={(e) => setRole(e.target.value as Exclude<AgencyRole, "OWNER">)}
                    disabled={pending}
                    className="h-9 w-full rounded-md border border-border bg-background px-2.5 text-small outline-none focus:border-primary"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </option>
                    ))}
                  </select>
                  <p className="text-caption text-muted-foreground">
                    {ROLE_DESCRIPTIONS[role]}
                  </p>
                </div>

                <div className="mt-2 flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    onClick={handleClose}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" variant="primary" size="sm" disabled={pending}>
                    {pending ? t("team.sendingInvite") : t("team.sendInvite")}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
