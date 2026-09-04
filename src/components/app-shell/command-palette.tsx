"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { t } from "@pdm/shared/copy";
import { cn } from "@/lib/cn";
import { Loader2 } from "lucide-react";
import { GlobeIcon, SearchIcon, UsersIcon, AlertCircleIcon } from "@/components/ui/icons";
import type { SearchResult } from "@/app/api/search/route";

/**
 * COMMAND PALETTE — §3.3, UI_DESIGN_PROMPTS §2, Phase 1 task 1.3.
 *
 * ⚠️ IT IS A DIALOG, NOT A DROPDOWN. Focus moves into it, Escape closes it, and
 * the page behind is inert — otherwise a keyboard user opens the palette and
 * Tab walks them into the sidebar behind it.
 *
 * ⚠️ DEBOUNCED, AND LATE RESPONSES ARE DISCARDED. Typing "acme" fires four
 * queries; without a sequence guard the answer to "acm" can land after the
 * answer to "acme" and the list shows results for a query the user has already
 * finished typing. That reads as the search being wrong, not slow.
 */

const DEBOUNCE_MS = 180;

const ICON = {
  website: GlobeIcon,
  client: UsersIcon,
  issue: AlertCircleIcon,
} as const;

export function CommandPalette({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  // Monotonic request id: only the newest response is allowed to render.
  const sequence = useRef(0);

  /*
   * ⚠️ FOCUS ONLY — the reset happens on CLOSE, in the handler.
   *
   * Clearing state from an effect keyed on `open` is a synchronous setState in
   * an effect body, which cascades an extra render every time the palette
   * opens (react-hooks/set-state-in-effect). Closing is an event; it resets in
   * `close()` below, where it belongs.
   */
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const term = query.trim();

  useEffect(() => {
    // An empty box has no results BY DEFINITION, so it is derived at render
    // (see `visible` below) rather than cleared from here — clearing state in
    // an effect body cascades a render on every keystroke back to empty.
    if (!open || term === "") return;

    const id = ++sequence.current;
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(term)}`);
        if (!response.ok) return;
        const body = (await response.json()) as { results: SearchResult[] };
        // Stale answer — a newer query has already been sent.
        if (id !== sequence.current) return;
        setResults(body.results);
        setActive(0);
      } catch {
        // A failed search is silent: the next keystroke retries, and an error
        // banner over a palette is noise the user cannot act on.
      } finally {
        if (id === sequence.current) {
          setLoading(false);
        }
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [term, open]);

  if (!open) return null;

  // Derived, not stored: results belong to the term that fetched them.
  const visible = term === "" ? [] : results;

  /** The reset lives here, not in an effect. See the note above. */
  function close() {
    setQuery("");
    setResults([]);
    setActive(0);
    setLoading(false);
    onClose();
  }

  function go(result: SearchResult) {
    close();
    router.push(result.href);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[12vh]"
      role="dialog"
      aria-modal="true"
      aria-label={t("shell.search")}
    >
      <button
        type="button"
        aria-label={t("common.close")}
        onClick={close}
        className="absolute inset-0 cursor-default bg-foreground/20 backdrop-blur-[2px] animate-in fade-in-0 duration-150"
      />

      <div className="relative w-full max-w-xl overflow-hidden rounded-lg border border-border bg-popover shadow-xl animate-in fade-in-0 zoom-in-95 duration-150">
        <div className="flex items-center gap-2.5 border-b border-border px-3.5">
          {loading ? (
            <Loader2 className="size-4 animate-spin text-primary shrink-0" />
          ) : (
            <SearchIcon className="text-muted-foreground" />
          )}
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              const val = event.target.value;
              setQuery(val);
              setLoading(val.trim() !== "");
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") close();
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActive((index) => Math.min(index + 1, visible.length - 1));
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setActive((index) => Math.max(index - 1, 0));
              }
              if (event.key === "Enter" && visible[active]) {
                event.preventDefault();
                go(visible[active]);
              }
            }}
            placeholder={t("shell.search")}
            aria-label={t("shell.search")}
            className="h-12 min-w-0 flex-1 bg-transparent text-body outline-none placeholder:text-muted-foreground"
          />
          <kbd className="rounded border border-border px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
            esc
          </kbd>
        </div>

        {term === "" ? (
          <p className="px-4 py-6 text-center text-small text-muted-foreground">
            {t("shell.searchHint")}
          </p>
        ) : visible.length === 0 ? (
          <p className="px-4 py-6 text-center text-small text-muted-foreground">
            {t("empty.noMatches")}
          </p>
        ) : (
          <ul className="max-h-80 overflow-y-auto py-1">
            {visible.map((result, index) => {
              const Icon = ICON[result.type];
              return (
                <li key={`${result.type}:${result.id}`}>
                  <button
                    type="button"
                    onMouseEnter={() => setActive(index)}
                    onClick={() => go(result)}
                    className={cn(
                      "flex w-full items-center gap-3 px-3.5 py-2 text-start text-small",
                      index === active && "bg-muted",
                    )}
                  >
                    <Icon className="text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{result.title}</span>
                      {result.subtitle ? (
                        <span className="block truncate text-caption text-muted-foreground">
                          {result.subtitle}
                        </span>
                      ) : null}
                    </span>
                    <span className="text-caption text-muted-foreground">
                      {t(`shell.type${result.type[0]!.toUpperCase()}${result.type.slice(1)}` as never)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
