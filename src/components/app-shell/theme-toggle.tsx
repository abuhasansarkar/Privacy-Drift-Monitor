"use client";

import { t } from "@pdm/shared/copy";
import { useTheme, type Theme } from "@/components/theme-provider";
import { cn } from "@/lib/cn";
import { MoonIcon, SlidersIcon, SunIcon } from "@/components/ui/icons";

/**
 * THEME TOGGLE — §3.3.
 *
 * Three states, not two: "system" is a real choice and stays selectable, so a
 * user who wants to follow their OS can get back to it after trying dark.
 * Rendered as a radio group because that is what it is — one of three.
 */

const OPTIONS: Array<{ value: Theme; label: string; Glyph: typeof SunIcon }> = [
  { value: "light", label: t("shell.themeLight"), Glyph: SunIcon },
  { value: "dark", label: t("shell.themeDark"), Glyph: MoonIcon },
  { value: "system", label: t("shell.themeSystem"), Glyph: SlidersIcon },
];

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <div
      role="radiogroup"
      aria-label={t("shell.theme")}
      className="flex items-center gap-0.5 rounded-md border border-border bg-background p-0.5"
    >
      {OPTIONS.map(({ value, label, Glyph }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={theme === value}
          aria-label={label}
          title={label}
          onClick={() => setTheme(value)}
          className={cn(
            "grid size-7 place-items-center rounded transition-colors",
            theme === value
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Glyph className="size-3.5" />
        </button>
      ))}
    </div>
  );
}
