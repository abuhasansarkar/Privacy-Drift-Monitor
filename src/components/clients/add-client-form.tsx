"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { t } from "@pdm/shared/copy";
import { Button } from "@/components/ui/button";
import { AlertCircleIcon } from "@/components/ui/icons";
import { createClient } from "@/server/actions/clients";

/**
 * ADD CLIENT — §3.7, feature 02.
 *
 * Only `name` is required: a client is a grouping, and asking for contact
 * details before the agency has decided the grouping is even right is friction
 * with no payoff. Everything else is editable afterwards.
 *
 * The slug is NOT asked for. It is derived from the name server-side, where the
 * `(agencyId, slug)` unique index lives and where a collision can actually be
 * retried — a slug field here would surface that race to the user as an error
 * they cannot act on.
 */
export function AddClientForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startSaving(async () => {
      const outcome = await createClient({
        name: name.trim(),
        portalEnabled: false,
        ...(contactEmail.trim() ? { contactEmail: contactEmail.trim() } : {}),
      });
      if (!outcome.ok) {
        setError(outcome.message);
        return;
      }
      router.push("/app/clients");
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-caption font-semibold">{t("clients.nameLabel")}</span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          maxLength={200}
          autoFocus
          placeholder={t("clients.namePlaceholder")}
          className="h-10 rounded-md border border-border bg-background px-3 text-small outline-none placeholder:text-muted-foreground"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-caption font-semibold">
          {t("clients.contactEmailLabel")}
        </span>
        <input
          type="email"
          value={contactEmail}
          onChange={(event) => setContactEmail(event.target.value)}
          maxLength={254}
          placeholder={t("clients.contactEmailPlaceholder")}
          className="h-10 rounded-md border border-border bg-background px-3 text-small outline-none placeholder:text-muted-foreground"
        />
      </label>

      {error ? (
        <p role="alert" className="flex items-start gap-2 text-small text-danger">
          <AlertCircleIcon className="mt-0.5" />
          {error}
        </p>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="secondary"
          onClick={() => router.push("/app/clients")}
        >
          {t("addWebsite.back")}
        </Button>
        <Button type="submit" variant="primary" disabled={saving || name.trim() === ""}>
          {saving ? t("clients.saving") : t("clients.addClient")}
        </Button>
      </div>
    </form>
  );
}
