import Link from "next/link";
import { t } from "@pdm/shared/copy";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";
import { ChevronRightIcon } from "./icons";

/**
 * OFFSET PAGINATION — §6.3.
 *
 * Real links, not buttons: a list view must be shareable and back-navigable,
 * which means the page number lives in the URL (§3.6) and paging is navigation.
 *
 * Used for clients and websites, whose sets are bounded by plan limits. The
 * audit log and evidence lists use cursor paging instead — an unbounded,
 * time-ordered set drifts under offset paging as new rows land.
 */
export function Pagination({
  page,
  perPage,
  total,
  /** Current search params, so paging preserves the active filters. */
  params,
}: {
  page: number;
  perPage: number;
  total: number;
  params: Record<string, string | string[] | undefined>;
}) {
  const lastPage = Math.max(1, Math.ceil(total / perPage));
  const from = total === 0 ? 0 : (page - 1) * perPage + 1;
  const to = Math.min(total, page * perPage);

  const hrefFor = (target: number) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      const single = Array.isArray(value) ? value[0] : value;
      if (single !== undefined && key !== "page") next.set(key, single);
    }
    next.set("page", String(target));
    return `?${next.toString()}`;
  };

  return (
    <>
      <span>
        {t("pagination.showing")} {formatNumber(from)}–{formatNumber(to)} /{" "}
        {formatNumber(total)}
      </span>
      {lastPage > 1 ? (
        <span className="ms-auto flex items-center gap-1">
          <PageLink
            href={hrefFor(page - 1)}
            label={t("pagination.previous")}
            disabled={page <= 1}
            direction="previous"
          />
          <span className="px-2 tabular-nums">
            {formatNumber(page)} / {formatNumber(lastPage)}
          </span>
          <PageLink
            href={hrefFor(page + 1)}
            label={t("pagination.next")}
            disabled={page >= lastPage}
            direction="next"
          />
        </span>
      ) : null}
    </>
  );
}

function PageLink({
  href,
  label,
  disabled,
  direction,
}: {
  href: string;
  label: string;
  disabled: boolean;
  direction: "previous" | "next";
}) {
  const chevron = (
    <ChevronRightIcon className={direction === "previous" ? "rotate-180" : undefined} />
  );
  const classes = cn(
    "grid size-8 place-items-center rounded-md border border-border",
    disabled
      ? "pointer-events-none opacity-40"
      : "text-muted-foreground hover:bg-muted hover:text-foreground",
  );

  // A disabled control is a <span>, not an <a> with a dead href — an anchor
  // that goes nowhere is still focusable and still announced as a link.
  return disabled ? (
    <span className={classes} aria-hidden="true">
      {chevron}
    </span>
  ) : (
    <Link href={href} aria-label={label} className={classes}>
      {chevron}
    </Link>
  );
}
