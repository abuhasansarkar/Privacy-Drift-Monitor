"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { t } from "@pdm/shared/copy";
import { CheckIcon, ChevronDownIcon, SearchIcon } from "./icons";
import { cn } from "@/lib/cn";

/**
 * LIST FILTERS — §3.6.
 *
 * A plain `<form method="get">`, deliberately: §3.6 requires filter state to
 * live in the URL so a view is shareable and back-navigable. A GET form IS
 * that — the browser serialises the fields into the query string and navigates,
 * which is exactly the contract the page's Zod parsing expects on the way back.
 *
 * Two consequences worth knowing, both wanted:
 *   - Submitting drops `page`, because a filter change should return to page 1.
 *     Any param that must survive a filter change has to be a field in the form.
 *   - Interactive custom select fields auto-submit on change while keeping the
 *     explicit "Apply" button available for text search inputs.
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
        className="h-9 rounded-md border border-border px-3.5 text-small font-medium transition-colors hover:bg-muted max-sm:h-11 cursor-pointer"
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
    <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-md border border-border bg-background px-3 text-small transition-colors hover:border-muted-foreground/40 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20 sm:max-w-64 max-sm:h-11">
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
 * A modern, accessible custom dropdown with smooth animations,
 * high-contrast dark/light theme styling, and automatic GET form submission.
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
  const [isOpen, setIsOpen] = useState(false);
  const [value, setValue] = useState(defaultValue ?? "");
  const [prevDefault, setPrevDefault] = useState(defaultValue);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const prefersReducedMotion = useReducedMotion();

  // Reset internal value if defaultValue prop changes (React recommended pattern)
  if (defaultValue !== prevDefault) {
    setPrevDefault(defaultValue);
    setValue(defaultValue ?? "");
  }

  // Close when clicking outside or pressing Escape
  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(event: MouseEvent | TouchEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const selectedOption =
    options.find((opt) => opt.value === value) ?? options[0];
  const currentLabel = selectedOption?.label ?? value;

  const handleSelect = (nextVal: string) => {
    setValue(nextVal);
    setIsOpen(false);

    if (inputRef.current) {
      inputRef.current.value = nextVal;
      // Auto-submit filter form for instant, modern feedback
      inputRef.current.form?.requestSubmit();
    }
  };

  const listboxId = `${name}-listbox`;
  const triggerId = `${name}-trigger`;

  return (
    <div ref={containerRef} className="relative inline-block">
      {/* Hidden input preserves standard GET form submission */}
      <input ref={inputRef} type="hidden" name={name} value={value} />

      <button
        id={triggerId}
        type="button"
        role="combobox"
        aria-controls={listboxId}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        onClick={() => setIsOpen((prev) => !prev)}
        className={cn(
          "group flex h-9 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-small transition-all cursor-pointer",
          "hover:border-muted-foreground/40 hover:bg-muted/20",
          "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 outline-none",
          isOpen && "border-ring ring-2 ring-ring/20 bg-muted/20",
          "max-sm:h-11"
        )}
      >
        <span className="shrink-0 select-none text-muted-foreground">
          {label}
        </span>
        <span className="font-medium text-foreground">{currentLabel}</span>
        <ChevronDownIcon
          className={cn(
            "size-3.5 text-muted-foreground/70 transition-transform duration-200 ease-out",
            isOpen && "rotate-180 text-foreground"
          )}
        />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            id={listboxId}
            role="listbox"
            aria-labelledby={triggerId}
            initial={
              prefersReducedMotion
                ? { opacity: 0 }
                : { opacity: 0, y: -4, scale: 0.98 }
            }
            animate={
              prefersReducedMotion
                ? { opacity: 1 }
                : { opacity: 1, y: 0, scale: 1 }
            }
            exit={
              prefersReducedMotion
                ? { opacity: 0 }
                : { opacity: 0, y: -4, scale: 0.98 }
            }
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute left-0 top-full z-50 mt-1.5 min-w-[12rem] max-h-60 overflow-y-auto rounded-lg border border-border bg-popover/95 p-1 text-popover-foreground shadow-xl backdrop-blur-md"
          >
            <div className="flex flex-col gap-0.5">
              {options.map((option) => {
                const isSelected = option.value === value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => handleSelect(option.value)}
                    className={cn(
                      "flex w-full cursor-pointer items-center justify-between rounded-md px-2.5 py-1.5 text-small text-left transition-colors",
                      isSelected
                        ? "bg-primary/10 font-medium text-primary dark:bg-primary/20"
                        : "text-foreground hover:bg-accent hover:text-accent-foreground"
                    )}
                  >
                    <span className="truncate">{option.label}</span>
                    {isSelected ? (
                      <CheckIcon className="size-4 shrink-0 text-primary" />
                    ) : null}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}


