import Link from "next/link";
import { SignInButton, SignUpButton, Show, UserButton } from "@clerk/nextjs";

/**
 * Global header with auth controls.
 *
 * NOTE: `Show` is Clerk's current conditional-rendering component. If your
 * installed @clerk/nextjs version predates it, the build will fail on the
 * import — swap to the older equivalents, which are a drop-in replacement:
 *
 *   import { SignedIn, SignedOut } from "@clerk/nextjs";
 *   <SignedOut>...</SignedOut>   instead of   <Show when="signed-out">
 *   <SignedIn>...</SignedIn>     instead of   <Show when="signed-in">
 */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-black/10 bg-white/80 backdrop-blur dark:border-white/10 dark:bg-black/60">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="font-semibold tracking-tight">
          Privacy Drift Monitor
        </Link>

        <nav className="flex items-center gap-3">
          <Show when="signed-out">
            <SignInButton>
              <button className="rounded-md px-3 py-1.5 text-sm font-medium text-foreground/80 transition hover:text-foreground">
                Sign in
              </button>
            </SignInButton>
            <SignUpButton>
              <button className="rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background transition hover:opacity-90">
                Start free trial
              </button>
            </SignUpButton>
          </Show>

          <Show when="signed-in">
            <Link
              href="/app"
              className="rounded-md px-3 py-1.5 text-sm font-medium text-foreground/80 transition hover:text-foreground"
            >
              Dashboard
            </Link>
            <UserButton appearance={{ elements: { avatarBox: "h-8 w-8" } }} />
          </Show>
        </nav>
      </div>
    </header>
  );
}
