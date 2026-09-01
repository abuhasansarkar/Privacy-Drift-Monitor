import { t } from "@pdm/shared/copy";
import { CHANGELOG_ENTRIES, type ChangelogItem } from "@content/changelog";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { formatDate } from "@/lib/format";
import { requireAgencyContext } from "@/server/auth/context";

/**
 * `/app/changelog` — PLAN.md §3.11, Phase 7 task 7.10.
 *
 * In-app changelog view keeping agency users informed about recent technical
 * improvements, new rules, and platform updates.
 */
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

export default async function AppChangelogPage() {
  await requireAgencyContext();

  const entries = [...CHANGELOG_ENTRIES].sort((a, b) =>
    b.date.localeCompare(a.date),
  );

  return (
    <div className="flex w-full flex-col gap-6">
      <PageHeader
        title={t("changelog.title")}
        subtitle={t("changelog.subtitle")}
      />

      <div className="flex flex-col gap-6">
        {entries.map((entry) => (
          <Card key={entry.version} className="flex flex-col p-6">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-4">
              <div className="flex items-center gap-3">
                <span className="font-mono text-base font-semibold text-primary">
                  {entry.version}
                </span>
                <h2 className="text-h3 font-semibold text-foreground">
                  {entry.title}
                </h2>
              </div>
              <time
                dateTime={entry.date}
                className="text-caption text-muted-foreground"
              >
                {formatDate(new Date(entry.date), "UTC")}
              </time>
            </div>

            <p className="mt-4 text-body text-muted-foreground">{entry.lead}</p>

            <ul className="mt-4 flex flex-col gap-3">
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
          </Card>
        ))}
      </div>
    </div>
  );
}
