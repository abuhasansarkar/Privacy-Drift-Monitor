import type { Metadata } from "next";
import { t } from "@pdm/shared/copy";

/**
 * FEATURES — §3.2, UI_DESIGN_PROMPTS §4.4.
 *
 * ⚠️ Statically prerendered, like every marketing page: nothing here calls
 * `cookies()` or a server-side Clerk helper, and the header's auth controls are
 * a client island for exactly that reason (see `(marketing)/layout.tsx`).
 *
 * ⚠️ Each block describes what the product RECORDS, not what it concludes. The
 * punchier marketing sentence would be a legal-compliance claim, and §1.11
 * forbids us from making one — this is a technical monitoring service.
 */
export const metadata: Metadata = {
  title: t("marketing.featuresTitle"),
  description: t("app.tagline"),
};

const FEATURES = [
  {
    title: t("features.browserTitle"),
    body: t("features.browserBody"),
  },
  {
    title: t("features.consentTitle"),
    body: t("features.consentBody"),
  },
  {
    title: t("features.trackerTitle"),
    body: t("features.trackerBody"),
  },
  {
    title: t("features.driftTitle"),
    body: t("features.driftBody"),
  },
];

export default function FeaturesPage() {
  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-20">
      <h1 className="text-display tracking-tight text-balance">
        {t("marketing.featuresTitle")}
      </h1>

      <div className="mt-12 flex flex-col gap-10">
        {FEATURES.map((feature) => (
          <article key={feature.title}>
            <h2 className="text-h2 tracking-tight">{feature.title}</h2>
            <p className="mt-3 text-body-lg text-muted-foreground">{feature.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
