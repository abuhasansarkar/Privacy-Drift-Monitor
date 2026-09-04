import Link from "next/link";
import { t } from "@pdm/shared/copy";
import { cn } from "@/lib/cn";
import { ChevronRightIcon } from "./icons";

/**
 * BREADCRUMBS — the trail back up from a detail page.
 *
 * The sidebar answers "where can I go"; it does not answer "where am I". On a
 * scan detail page the sidebar highlights Websites and nothing on screen says
 * which website, or how to get back to it without the browser's Back button —
 * which is the wrong tool, because a reader who arrived from an emailed link
 * has no history to go back through.
 *
 * ⚠️ THE LAST CRUMB IS NOT A LINK, AND CARRIES `aria-current="page"`. A link to
 * the page you are already on is a dead control that costs a keyboard user a
 * tab stop and tells a screen-reader user nothing. It renders as text.
 *
 * ⚠️ SEPARATORS ARE `aria-hidden`. The list structure already conveys the
 * nesting to assistive technology; announcing "chevron right" between every
 * level is noise that makes the trail slower to hear than to read.
 */

export interface Crumb {
  label: string;
  /** Omit on the final crumb — the page you are on is not a destination. */
  href?: string;
}

export function Breadcrumbs({
  items,
  className,
}: {
  items: readonly Crumb[];
  className?: string;
}) {
  if (items.length === 0) return null;

  return (
    <nav aria-label={t("a11y.breadcrumb")} className={cn("min-w-0", className)}>
      <ol className="flex flex-wrap items-center gap-1 text-caption text-muted-foreground">
        {items.map((crumb, index) => {
          const last = index === items.length - 1;
          return (
            <li key={`${crumb.label}-${index}`} className="flex min-w-0 items-center gap-1">
              {index > 0 ? (
                <span aria-hidden className="shrink-0 opacity-60">
                  <ChevronRightIcon />
                </span>
              ) : null}
              {crumb.href && !last ? (
                <Link
                  href={crumb.href}
                  className="truncate rounded-sm transition-colors hover:text-foreground"
                >
                  {crumb.label}
                </Link>
              ) : (
                <span
                  aria-current={last ? "page" : undefined}
                  className={cn("truncate", last && "text-foreground")}
                >
                  {crumb.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
