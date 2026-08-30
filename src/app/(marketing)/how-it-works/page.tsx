import type { Metadata } from "next";
import { t } from "@pdm/shared/copy";

/**
 * HOW IT WORKS — §3.2, UI_DESIGN_PROMPTS §4.5.
 *
 * A numbered sequence, because the order is the explanation: consent is tested
 * before trackers are classified, and comparison happens after both. A grid of
 * feature cards would lose that, and the ordering is what makes the honesty
 * panel at the end land.
 */
export const metadata: Metadata = {
  title: t("marketing.howItWorksTitle"),
  description: t("app.tagline"),
};

const STAGES = [
  t("howItWorks.stage1"),
  t("howItWorks.stage2"),
  t("howItWorks.stage3"),
  t("howItWorks.stage4"),
  t("howItWorks.stage5"),
  t("howItWorks.stage6"),
];

export default function HowItWorksPage() {
  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-20">
      <h1 className="text-display tracking-tight text-balance">
        {t("marketing.howItWorksTitle")}
      </h1>

      <ol className="mt-12 flex flex-col gap-6 border-s border-border ps-6">
        {STAGES.map((stage, index) => (
          <li key={stage} className="relative">
            <span
              aria-hidden="true"
              className="absolute -start-[2.05rem] top-0.5 grid size-6 place-items-center rounded-full bg-primary text-caption font-semibold text-primary-foreground"
            >
              {index + 1}
            </span>
            <p className="text-body-lg">{stage}</p>
          </li>
        ))}
      </ol>

      {/* §4.5's honesty panel — the boundary, stated where a buyer reads it. */}
      <div className="mt-14 rounded-lg border border-border p-6">
        <h2 className="text-h3">{t("marketing.honestyTitle")}</h2>
        <div className="mt-4 grid gap-6 sm:grid-cols-2">
          <p className="text-small text-muted-foreground">{t("marketing.honestyCan")}</p>
          <p className="text-small text-muted-foreground">
            {t("marketing.honestyCannot")}
          </p>
        </div>
      </div>
    </section>
  );
}
