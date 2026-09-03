"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { THEME_INIT_SCRIPT, THEME_STORAGE_KEY } from "@/lib/theme-script";

/**
 * THEME PROVIDER — PLAN.md §3.3 (user menu theme choice), §11.3 (dark tokens),
 * Phase 0 task 0.8.
 *
 * Dark mode is CLASS-driven (`.dark` on <html>) because the user makes an
 * explicit choice in the user menu; `globals.css` pairs this with
 * `@custom-variant dark` so Tailwind's `dark:` utilities follow the class,
 * not the OS. "system" tracks `prefers-color-scheme` live.
 *
 * No `next-themes` dependency — the whole contract is ~80 lines and one less
 * package on the layout's critical path.
 *
 * The inline script below runs BEFORE hydration and applies the stored choice,
 * so a dark-theme user never sees a white flash. It must stay dependency-free
 * and inline. <html> already carries `suppressHydrationWarning` for the class
 * this script adds outside React's knowledge.
 */

export type Theme = "light" | "dark" | "system";

const ThemeContext = createContext<{
  /** The stored preference — "system" is a real value, not resolved away. */
  theme: Theme;
  setTheme: (theme: Theme) => void;
} | null>(null);

function readStoredTheme(): Theme {
  if (typeof window === "undefined") return "system";
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    return "system";
  }
}

function applyTheme(theme: Theme) {
  const dark =
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Initialized from storage on the client; the server renders "system" and the
  // inline script has already applied the real class before hydration.
  const [theme, setThemeState] = useState<Theme>(readStoredTheme);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Storage unavailable (private mode) — the choice still applies for
      // this page's lifetime via the effect below.
    }
  }, []);

  useEffect(() => {
    applyTheme(theme);
    if (theme !== "system") return;
    // Track OS changes live while in "system".
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [theme]);

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);

  return (
    <ThemeContext.Provider value={value}>
      {/*
        ⚠️ ALLOWED BY HASH, NOT BY NONCE (§10.1), AND THAT IS WHAT KEEPS THE
        MARKETING PAGES STATIC. A nonce has to be read from the request, and
        reading the request in the ROOT layout makes every route in the app
        dynamic — which is how `/solutions/[industry]` came to fail its build
        and how the "statically prerendered marketing pages" of §3.2 quietly
        stopped being prerendered at all.

        This script's bytes are a compile-time constant, so the strict policy
        names its SHA-256 instead. `src/proxy.ts` derives that hash from the
        same constant. Nothing here touches the request.
      */}
      <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      {children}
    </ThemeContext.Provider>
  );
}

/** Throws outside the provider — a silent no-op toggle is a support ticket. */
export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}
