import Link from "next/link";
import { t } from "@pdm/shared/copy";
import { HELP_ARTICLES, searchHelp } from "@content/help";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { buttonClasses } from "@/components/ui/button";
import { requireAgencyContext } from "@/server/auth/context";

/**
 * `/app/help` — PLAN.md §3.11, Phase 6.
 *
 * ⚠️ SEARCH IS A QUERY PARAMETER AND A `GET` FORM, NOT CLIENT STATE. That makes
 * a search result a URL support can paste into a reply, keeps the page a Server
 * Component, and means it works before JavaScript loads. For eight articles a
 * client-side filter would be more code for a worse result.
 *
 * ⚠️ EVERY ARTICLE IS A CASE WHERE THE PRODUCT LOOKS BROKEN AND IS NOT — see
 * the note in `content/help`. That is the selection criterion, and it is why
 * the list is short.
 */
export default async function HelpPage({ searchParams }: PageProps<"/app/help">) {
  // Help is available to any member; there is nothing tenant-specific on it.
  await requireAgencyContext();
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q : "";
  const articles = searchHelp(query);

  return (
    <div className="flex w-full flex-col gap-5">
      <PageHeader title={t("help.title")} subtitle={t("help.subtitle")} />

      <form className="flex gap-2">
        <label className="sr-only" htmlFor="help-search">
          {t("help.searchLabel")}
        </label>
        <input
          id="help-search"
          name="q"
          defaultValue={query}
          placeholder={t("help.searchPlaceholder")}
          className="h-9 w-full max-w-sm rounded-md border border-border bg-background px-3 text-small"
        />
      </form>

      {articles.length === 0 ? (
        <Card className="p-4 text-small text-muted-foreground">{t("help.noResults")}</Card>
      ) : (
        <div className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card">
          {articles.map((article) => (
            /*
              ⚠️ NATIVE `<details>`, NOT AN ACCORDION COMPONENT — the same choice
              the pricing FAQ makes. It opens without JavaScript, is
              keyboard-accessible by construction, and lets a browser's own
              find-in-page reach collapsed text.
            */
            <details key={article.slug} id={article.slug} className="group p-4">
              <summary className="cursor-pointer list-none font-medium marker:content-none">
                <span className="flex items-start gap-2">
                  <span className="mt-0.5 text-muted-foreground transition group-open:rotate-90">
                    ›
                  </span>
                  {article.title}
                </span>
              </summary>
              <div className="mt-2 flex flex-col gap-2 pl-5">
                {article.body.map((paragraph) => (
                  <p key={paragraph} className="text-small text-muted-foreground">
                    {paragraph}
                  </p>
                ))}
              </div>
            </details>
          ))}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader title={t("help.contactTitle")} />
          <div className="flex flex-col items-start gap-3 p-4">
            <p className="text-small text-muted-foreground">{t("help.contactBody")}</p>
            <Link href="/contact" className={buttonClasses("secondary", "md")}>
              {t("help.contactCta")}
            </Link>
          </div>
        </Card>

        <Card>
          <CardHeader title={t("help.shortcutsTitle")} />
          <dl className="flex flex-col gap-2 p-4 text-small">
            {SHORTCUTS.map((shortcut) => (
              <div key={shortcut.keys} className="flex items-center gap-3">
                <dt className="w-24 shrink-0">
                  <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-mono">
                    {shortcut.keys}
                  </kbd>
                </dt>
                <dd className="text-muted-foreground">{shortcut.action}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>

      <p className="text-caption text-muted-foreground">
        {HELP_ARTICLES.length} articles
      </p>
    </div>
  );
}

/**
 * ⚠️ ONLY SHORTCUTS THAT ACTUALLY EXIST. A reference listing keys the app does
 * not bind is worse than no reference — somebody presses one, nothing happens,
 * and they stop trusting the page.
 */
const SHORTCUTS = [
  { keys: "/", action: "Focus search" },
  { keys: "Esc", action: "Close a dialog or drawer" },
] as const;
