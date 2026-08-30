import Link from "next/link";
import { SignInButton, SignUpButton, Show, UserButton } from "@clerk/nextjs";
// Subpath import, not the `@pdm/shared` barrel: the barrel pulls in pino and
// tldts, which have no business in a component's module graph.
import { t } from "@pdm/shared/copy";

/**
 * MARKETING CHROME — §3.1.
 *
 * Belongs to the public surface ONLY. It must never be rendered from the root
 * layout: §3.1 requires four layouts with four auth postures kept physically
 * separate, "so an unauthenticated page can never accidentally inherit an
 * authenticated shell". Rendering this in the root layout put the marketing
 * header on /app, /admin and /portal.
 *
 * ⚠️ `<Show when="signed-in" | "signed-out">` is the ONLY conditional-rendering
 * component in @clerk/nextjs v7 (Clerk Core 3). `<SignedIn>` / `<SignedOut>`
 * were REMOVED in Core 3 and throw at render time — they are not a fallback,
 * they are a 500. Do not "modernize" this back to them.
 *
 * Colors come from the semantic tokens in globals.css, so dark mode follows the
 * `.dark` class the user chose rather than the OS setting (§3.3).
 */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="font-semibold tracking-tight">
          {t("app.name")}
        </Link>

        <nav
          aria-label={t("a11y.mainNavigation")}
          className="flex items-center gap-3"
        >
          <Show when="signed-out">
            <SignInButton>
              <button className="rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition hover:text-foreground">
                {t("auth.signIn")}
              </button>
            </SignInButton>
            <SignUpButton>
              <button className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition hover:opacity-90">
                {t("auth.startTrial")}
              </button>
            </SignUpButton>
          </Show>

          <Show when="signed-in">
            <Link
              href="/app"
              className="rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition hover:text-foreground"
            >
              {t("nav.dashboard")}
            </Link>
            <UserButton appearance={{ elements: { avatarBox: "h-8 w-8" } }} />
          </Show>
        </nav>
      </div>
    </header>
  );
}
