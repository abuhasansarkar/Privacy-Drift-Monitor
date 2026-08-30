"use client";

import Link from "next/link";
import { SignInButton, SignUpButton, useAuth } from "@clerk/nextjs";
import { t } from "@pdm/shared/copy";

/**
 * AUTH CONTROLS FOR THE PUBLIC HEADER — §3.2.
 *
 * ⚠️ WHY THIS IS A CLIENT ISLAND. Clerk's `<Show when="signed-in">` resolves
 * auth state ON THE SERVER, so any route that renders it opts out of static
 * prerendering. §3.2 wants marketing pages prerendered — they are the pages a
 * first-time visitor waits on — so the two-line auth control cannot be the
 * thing that makes the whole page dynamic.
 *
 * `useAuth()` moves that decision to the browser: the page prerenders, and this
 * island swaps in once Clerk loads. `isLoaded` gates the first paint so the
 * header does not flash "Sign in" at someone who is already signed in.
 */
export function MarketingAuthLinks() {
  const { isLoaded, isSignedIn } = useAuth();

  // Reserve the space before Clerk answers. Rendering nothing at all would let
  // the nav collapse and then jump, which is a layout shift on every load.
  if (!isLoaded) return <span className="h-8 w-40" aria-hidden="true" />;

  if (isSignedIn) {
    return (
      <Link
        href="/app"
        className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition hover:opacity-90"
      >
        {t("nav.dashboard")}
      </Link>
    );
  }

  return (
    <>
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
    </>
  );
}
