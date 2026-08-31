"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { t } from "@pdm/shared/copy";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/severity-badge";
import { invitePortalUser, revokePortalUser } from "@/server/actions/portal";

/**
 * PORTAL CONTACTS — §3.13, feature doc 15.
 *
 * ⚠️ REVOKE CONFIRMS AND SAYS WHAT HAPPENS. Revocation signs the contact out
 * immediately and kills their link (§6.10); a one-click revoke with no warning
 * is an accident an agency has to apologise to their client for.
 */

export interface PortalContact {
  id: string;
  email: string;
  name: string | null;
  status: "INVITED" | "ACTIVE" | "REVOKED";
  lastLoginIso: string | null;
}

const STATUS_TONE = {
  INVITED: "warning",
  ACTIVE: "success",
  REVOKED: "muted",
} as const;

const STATUS_LABEL = {
  INVITED: t("portalAdmin.statusInvited"),
  ACTIVE: t("portalAdmin.statusActive"),
  REVOKED: t("portalAdmin.statusRevoked"),
};

export function PortalContacts({
  clientId,
  contacts,
  portalEnabled,
}: {
  clientId: string;
  contacts: PortalContact[];
  portalEnabled: boolean;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <Card>
      <CardHeader title={t("portalAdmin.title")} />

      {!portalEnabled ? (
        <p className="px-4 py-3 text-small text-muted-foreground">
          {t("portalAdmin.portalDisabled")}
        </p>
      ) : null}

      {contacts.length === 0 ? (
        <p className="px-4 py-3 text-small text-muted-foreground">
          {t("portalAdmin.emptyBody")}
        </p>
      ) : (
        <ul>
          {contacts.map((contact) => (
            <li
              key={contact.id}
              className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3 last:border-b-0"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{contact.name ?? contact.email}</p>
                <p className="truncate text-caption text-muted-foreground">
                  {contact.email}
                </p>
              </div>
              <StatusBadge
                tone={STATUS_TONE[contact.status]}
                label={STATUS_LABEL[contact.status]}
              />
              <span className="text-caption text-muted-foreground">
                {contact.lastLoginIso
                  ? new Date(contact.lastLoginIso).toLocaleDateString("en-GB")
                  : t("portalAdmin.neverSignedIn")}
              </span>
              {contact.status !== "REVOKED" ? (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => {
                    if (!window.confirm(t("portalAdmin.revokeConfirm"))) return;
                    start(async () => {
                      const result = await revokePortalUser({ portalUserId: contact.id });
                      if (!result.ok) {
                        setError(result.message);
                        return;
                      }
                      setMessage(t("portalAdmin.revoked"));
                      router.refresh();
                    });
                  }}
                >
                  {t("portalAdmin.revoke")}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          setMessage(null);
          start(async () => {
            const result = await invitePortalUser({
              clientId,
              email,
              name: name.trim() || null,
            });
            if (!result.ok) {
              setError(result.message);
              return;
            }
            setEmail("");
            setName("");
            setMessage(t("portalAdmin.invited"));
            router.refresh();
          });
        }}
        className="flex flex-wrap items-end gap-2 border-t border-border px-4 py-3"
      >
        <label className="min-w-[12rem] flex-1">
          <span className="mb-1 block text-caption font-medium text-muted-foreground">
            {t("portalAdmin.emailLabel")}
          </span>
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="h-9 w-full rounded-md border border-border bg-background px-2.5 text-small max-sm:h-11"
          />
        </label>
        <label className="min-w-[10rem] flex-1">
          <span className="mb-1 block text-caption font-medium text-muted-foreground">
            {t("portalAdmin.nameLabel")}
          </span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="h-9 w-full rounded-md border border-border bg-background px-2.5 text-small max-sm:h-11"
          />
        </label>
        <Button type="submit" variant="primary" disabled={pending || !portalEnabled}>
          {pending ? t("portalAdmin.inviting") : t("portalAdmin.invite")}
        </Button>
      </form>

      {error ? (
        <p role="alert" className="px-4 pb-3 text-small text-danger">
          {error}
        </p>
      ) : null}
      {message ? (
        <p role="status" className="px-4 pb-3 text-small text-success">
          {message}
        </p>
      ) : null}
    </Card>
  );
}
