import type { Metadata } from "next";
import { t } from "@pdm/shared/copy";
import { ContactForm } from "@/components/marketing/contact-form";

/**
 * `/contact` — PLAN.md §3.2, Phase 6.
 *
 * ⚠️ THE PAGE IS STATIC AND THE FORM IS A CLIENT ISLAND, the same arrangement
 * as `/pricing` and `/free-scanner`. Every control — Turnstile, the rate limit,
 * the honeypot — is enforced in `POST /api/public/contact`, because a control
 * that lives in the browser is a suggestion.
 */
export const metadata: Metadata = {
  title: t("marketingPages.contactTitle"),
  description: t("marketingPages.contactSubtitle"),
};

export default function ContactPage() {
  return (
    <section className="mx-auto w-full max-w-2xl px-4 py-20">
      <h1 className="text-display tracking-tight text-balance">
        {t("marketingPages.contactTitle")}
      </h1>
      <p className="mt-4 text-body-lg text-muted-foreground">
        {t("marketingPages.contactSubtitle")}
      </p>

      <div className="relative mt-10">
        <ContactForm />
      </div>
    </section>
  );
}
