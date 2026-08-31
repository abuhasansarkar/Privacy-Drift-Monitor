"use client";

import { useState, useTransition } from "react";
import { t } from "@pdm/shared/copy";

/**
 * ⚠️ ALWAYS RENDERS THE SAME CONFIRMATION, whatever the server said. §6.10's
 * anti-enumeration rule only holds if the CLIENT behaves identically too — a
 * form that showed "we couldn't find that address" would leak exactly what the
 * 204 was protecting.
 */
export function PortalLoginForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [pending, start] = useTransition();

  if (sent) {
    return (
      <p role="status" className="rounded-md border border-border bg-muted/40 p-4">
        {t("portal.linkSent")}
      </p>
    );
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        start(async () => {
          // The result is deliberately not inspected — see the note above.
          await fetch("/api/portal/auth/request", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email }),
          }).catch(() => undefined);
          setSent(true);
        });
      }}
      className="flex flex-col gap-3"
    >
      <label className="block">
        <span className="mb-1 block text-[14px] font-medium text-muted-foreground">
          {t("portal.emailLabel")}
        </span>
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="h-11 w-full rounded-md border border-border bg-background px-3 text-[16px]"
        />
      </label>
      <button
        type="submit"
        disabled={pending || email.trim() === ""}
        className="inline-flex h-11 items-center justify-center rounded-md border border-transparent bg-primary px-4 text-[15px] font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
      >
        {pending ? t("portal.sending") : t("portal.sendLink")}
      </button>
    </form>
  );
}
