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

const STORAGE_KEY = "pdm-theme";

const ThemeContext = createContext<{
  /** The stored preference — "system" is a real value, not resolved away. */
  theme: Theme;
  setTheme: (theme: Theme) => void;
} | null>(null);

/** Pre-hydration, dependency-free, and resilient to a blocked localStorage. */
const APPLY_ON_LOAD = `try{var t=localStorage.getItem(${JSON.stringify(
  STORAGE_KEY,
)});var d=t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d)}catch(e){}`;

function readStoredTheme(): Theme {
  if (typeof window === "undefined") return "system";
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
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

export function ThemeProvider({
  children,
  /**
   * The CSP nonce for this request, from `src/proxy.ts`.
   *
   * ⚠️ OPTIONAL, BECAUSE THE STATIC MARKETING PAGES HAVE NONE — their policy
   * uses `'unsafe-inline'` instead, for the reason set out in `proxy.ts`. An
   * `undefined` nonce renders no attribute, which is exactly right there and
   * exactly wrong anywhere the strict policy applies; the layout passes it.
   */
  nonce,
}: {
  children: ReactNode;
  nonce?: string;
}) {
  // Initialized from storage on the client; the server renders "system" and the
  // inline script has already applied the real class before hydration.
  const [theme, setThemeState] = useState<Theme>(readStoredTheme);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
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
        ⚠️ THE NONCE IS REQUIRED, NOT OPTIONAL (§10.1). This is the one inline
        script the app ships, and under a nonce-based CSP an inline script
        without one is refused — which means the stored theme is not applied
        before hydration and every dark-mode user gets a white flash on every
        navigation. The nonce is read from the request header the proxy sets.
      */}
      <script nonce={nonce} dangerouslySetInnerHTML={{ __html: APPLY_ON_LOAD }} />
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
