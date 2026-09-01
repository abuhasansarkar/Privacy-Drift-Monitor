import type { Metadata } from "next";
import { t } from "@pdm/shared/copy";
import { FreeScanForm } from "@/components/free-scanner/scan-form";
import { CheckIcon } from "@/components/ui/icons";

/**
 * `/free-scanner` — PLAN.md §3.2, Phase 6 task 6.5.
 *
 * ⚠️ THE PAGE IS STATIC; THE FORM IS THE ONLY DYNAMIC THING ON IT. Everything
 * request-shaped happens in `POST /api/public/free-scan`, which is where every
 * abuse control lives.
 *
 * ⚠️ THE COPY PROMISES WHAT WE ACTUALLY DO. "See what a website loads before
 * anyone consents" is a statement about observed behaviour; §1.11 forbids the
 * punchier version, and this is the page most likely to attract it.
 */
export const metadata: Metadata = {
  title: t("freeScanner.title"),
  description: t("freeScanner.subheadline"),
};

const INCLUDED = [
  t("freeScanner.trackersBefore"),
  t("freeScanner.cookiesBefore"),
  t("freeScanner.thirdPartyDomains"),
  t("freeScanner.bannerDetected"),
];

export default function FreeScannerPage() {
  return (
    <section className="mx-auto w-full max-w-2xl px-4 py-20">
      <h1 className="text-display tracking-tight text-balance">
        {t("freeScanner.headline")}
      </h1>
      <p className="mt-4 text-body-lg text-muted-foreground">
        {t("freeScanner.subheadline")}
      </p>

      <div className="mt-8">
        <FreeScanForm />
      </div>

      <ul className="mt-10 flex flex-col gap-2 text-small text-muted-foreground">
        {INCLUDED.map((item) => (
          <li key={item} className="flex items-start gap-2">
            <CheckIcon className="mt-0.5 shrink-0 text-success" />
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}
