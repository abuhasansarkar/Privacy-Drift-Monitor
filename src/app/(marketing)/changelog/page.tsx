import type { Metadata } from "next";
import { t } from "@pdm/shared/copy";
import { CHANGELOG_ENTRIES, type ChangelogItem } from "@content/changelog";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";

/**
 * `/changelog` — PLAN.md §3.2, Phase 7 task 7.10.
 *
 * ⚠️ STATICALLY PRERENDERED: Product updates are compiled from structured TypeScript
 * in `content/changelog` and validated by the terminology CI gate.
 */
export const metadata: Metadata = {
  title: t("marketingPages.changelogTitle"),
  description: t("marketingPages.changelogSubtitle"),
};

function categoryBadgeVariant(category: ChangelogItem["category"]) {
  switch (category) {
    case "feature":
      return "default";
    case "improvement":
      return "secondary";
    case "security":
      return "outline";
    case "fix":
      return "outline";
    default:
      return "secondary";
  }
}

function categoryLabel(category: ChangelogItem["category"]) {
  switch (category) {
    case "feature":
      return t("changelog.categoryFeature");
    case "improvement":
      return t("changelog.categoryImprovement");
    case "fix":
      return t("changelog.categoryFix");
    case "security":
      return t("changelog.categorySecurity");
  }
}

export default function MarketingChangelogPage() {
  const entries = [...CHANGELOG_ENTRIES].sort((a, b) =>
    b.date.localeCompare(a.date),
  );

  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-20">
      <h1 className="text-display tracking-tight text-balance">
        {t("marketingPages.changelogTitle")}
      </h1>
      <p className="mt-4 text-body-lg text-muted-foreground">
        {t("marketingPages.changelogSubtitle")}
      </p>

      <div className="mt-12 flex flex-col divide-y divide-border border-y border-border">
        {entries.map((entry) => (
          <article key={entry.version} className="py-10">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-mono text-sm font-semibold text-primary">
                {entry.version}
              </span>
              <span className="text-muted-foreground">•</span>
              <time
                dateTime={entry.date}
                className="text-caption text-muted-foreground"
              >
                {formatDate(new Date(entry.date), "UTC")}
              </time>
            </div>

            <h2 className="mt-2 text-h2 tracking-tight">{entry.title}</h2>
            <p className="mt-2 text-body text-muted-foreground">{entry.lead}</p>

            <ul className="mt-6 flex flex-col gap-3">
              {entry.items.map((item, idx) => (
                <li key={idx} className="flex items-start gap-3 text-body-sm">
                  <Badge
                    variant={categoryBadgeVariant(item.category)}
                    className="mt-0.5 uppercase tracking-wider text-[10px]"
                  >
                    {categoryLabel(item.category)}
                  </Badge>
                  <span className="text-foreground">{item.description}</span>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}
