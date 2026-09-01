"use client";

import Script from "next/script";
import { useRef, useState, useTransition } from "react";
import { t } from "@pdm/shared/copy";
import { Button } from "@/components/ui/button";
import { AlertTriangleIcon, CheckIcon } from "@/components/ui/icons";

/**
 * THE CONTACT FORM — PLAN.md §3.2, Phase 6.
 *
 * ⚠️ THE HONEYPOT IS HIDDEN FROM SIGHT **AND** FROM ASSISTIVE TECHNOLOGY. A
 * field hidden with CSS alone is read out by a screen reader and tabbed into by
 * a keyboard user, who then fills it in and has their message silently
 * discarded. `aria-hidden` plus `tabIndex={-1}` plus `autoComplete="off"` is
 * the combination that hides it from people and not from bots.
 *
 * ⚠️ `display: none` WOULD ALSO DEFEAT THE HONEYPOT for the better bots, which
 * skip fields that are not rendered. Off-screen positioning is the compromise
 * that keeps it in the layout tree.
 */

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

const ERRORS: Record<string, string> = {
  INVALID: t("marketingPages.contactError"),
  CHALLENGE_FAILED: t("freeScanner.errorChallenge"),
  RATE_LIMITED: t("freeScanner.errorRateLimitedIp"),
  FAILED: t("marketingPages.contactError"),
};

export function ContactForm() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const tokenRef = useRef("");
  const widgetRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  function mountWidget() {
    if (!SITE_KEY || !widgetRef.current || !window.turnstile) return;
    if (widgetIdRef.current !== null) return;
    widgetIdRef.current = window.turnstile.render(widgetRef.current, {
      sitekey: SITE_KEY,
      callback: (token: string) => {
        tokenRef.current = token;
      },
    });
  }

  if (sent) {
    return (
      <p
        role="status"
        className="flex items-start gap-2 rounded-lg border border-success/40 bg-success-muted p-4 text-small text-success"
      >
        <CheckIcon className="mt-0.5 shrink-0" />
        {t("marketingPages.contactSuccess")}
      </p>
    );
  }

  return (
    <>
      {SITE_KEY ? (
        <Script
          src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
          onLoad={mountWidget}
        />
      ) : null}

      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          start(async () => {
            setError(null);
            const response = await fetch("/api/public/contact", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                name: data.get("name"),
                email: data.get("email"),
                agency: data.get("agency") ?? "",
                siteCount: data.get("siteCount") ?? "",
                topic: data.get("topic"),
                message: data.get("message"),
                website: data.get("website") ?? "",
                turnstileToken: tokenRef.current,
              }),
            }).catch(() => null);

            if (response?.ok) {
              setSent(true);
              return;
            }
            const body: unknown = await response?.json().catch(() => null);
            const code = (body as { error?: unknown } | null)?.error;
            setError(
              (typeof code === "string" ? ERRORS[code] : undefined) ??
                t("marketingPages.contactError"),
            );
            if (widgetIdRef.current !== null) window.turnstile?.reset(widgetIdRef.current);
            tokenRef.current = "";
          });
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("marketingPages.contactName")}>
            <input name="name" required maxLength={120} className={INPUT} />
          </Field>
          <Field label={t("marketingPages.contactEmail")}>
            <input name="email" type="email" required maxLength={200} className={INPUT} />
          </Field>
          <Field label={t("marketingPages.contactAgency")}>
            <input name="agency" maxLength={160} className={INPUT} />
          </Field>
          <Field label={t("marketingPages.contactSiteCount")}>
            <input name="siteCount" maxLength={40} className={INPUT} />
          </Field>
        </div>

        <Field label={t("marketingPages.contactTopic")}>
          <select name="topic" defaultValue="sales" className={INPUT}>
            <option value="sales">{t("marketingPages.contactTopicSales")}</option>
            <option value="support">{t("marketingPages.contactTopicSupport")}</option>
            <option value="security">{t("marketingPages.contactTopicSecurity")}</option>
            <option value="other">{t("marketingPages.contactTopicOther")}</option>
          </select>
        </Field>

        <Field label={t("marketingPages.contactMessage")}>
          <textarea
            name="message"
            required
            minLength={10}
            maxLength={4000}
            rows={6}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-body"
          />
        </Field>

        {/* The honeypot. Off-screen rather than `display: none` — see the note
            at the top of this file. */}
        <div className="absolute left-[-9999px] top-auto h-px w-px overflow-hidden">
          <label htmlFor="contact-website" aria-hidden="true">
            Leave this empty
          </label>
          <input
            id="contact-website"
            name="website"
            type="text"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
          />
        </div>

        <div ref={widgetRef} />

        {error ? (
          <p role="alert" className="flex items-start gap-2 text-small text-danger">
            <AlertTriangleIcon className="mt-0.5 shrink-0" />
            {error}
          </p>
        ) : null}

        <div>
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? t("marketingPages.contactSending") : t("marketingPages.contactSubmit")}
          </Button>
        </div>
      </form>
    </>
  );
}

const INPUT =
  "h-10 w-full rounded-md border border-border bg-background px-3 text-body";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-small font-medium">{label}</span>
      {children}
    </label>
  );
}
