import Link from "next/link";
import type { ReactNode } from "react";
import { t } from "@pdm/shared/copy";
import { SearchIcon } from "./icons";

/**
 * LIST FILTERS — §3.6.
 *
 * A plain `<form method="get">`, deliberately: §3.6 requires filter state to
 * live in the URL so a view is shareable and back-navigable. A GET form IS
 * that — the browser serialises the fields into the query string and navigates,
 * which is exactly the contract the page's Zod parsing expects on the way back.
 *
 * Two consequences worth knowing, both wanted:
 *   - It works with JavaScript disabled and before hydration.
 *   - Submitting drops `page`, because a filter change should return to page 1.
 *     Any param that must survive a filter change has to be a field in the form.
 */

export function FilterForm({
  children,
  /** Shown when any filter is set. Clears by navigating to the bare path. */
  clearHref,
}: {
  children: ReactNode;
  clearHref?: string;
}) {
  return (
    <form method="get" className="flex flex-wrap items-center gap-2">
      {children}
      <button
        type="submit"
        className="h-9 rounded-md border border-border px-3.5 text-small font-medium transition-colors hover:bg-muted max-sm:h-11"
      >
        {t("filters.apply")}
      </button>
      {clearHref ? (
        <Link
          href={clearHref}
          className="h-9 rounded-md px-3 text-small font-medium leading-9 text-muted-foreground transition-colors hover:text-foreground max-sm:h-11 max-sm:leading-[2.75rem]"
        >
          {t("common.clearFilters")}
        </Link>
      ) : null}
    </form>
  );
}

export function SearchField({
  defaultValue,
  placeholder,
}: {
  defaultValue?: string;
  placeholder: string;
}) {
  return (
    <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-md border border-border bg-background px-3 text-small sm:max-w-64 max-sm:h-11">
      <SearchIcon className="text-muted-foreground" />
      <span className="sr-only">{placeholder}</span>
      <input
        type="search"
        name="search"
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
      />
    </label>
  );
}

/**
 * A native `<select>` rather than a custom listbox: it is keyboard- and
 * screen-reader-correct for free, and on a phone it opens the platform picker,
 * which beats anything a dropdown of our own would do at that size.
 */
export function SelectField({
  name,
  label,
  defaultValue,
  options,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  /** The first option is the "no filter" case and submits an empty value. */
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="flex h-9 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-small max-sm:h-11">
      <span className="text-muted-foreground">{label}</span>
      <select
        name={name}
        defaultValue={defaultValue ?? ""}
        className="bg-transparent font-medium outline-none"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
