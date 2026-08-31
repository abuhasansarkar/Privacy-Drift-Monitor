import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

/**
 * Next.js 16 renamed `middleware.ts` to `proxy.ts`. Do NOT add a `runtime`
 * export here — setting it inside a proxy file throws at build time.
 * Proxy always runs on the Node.js runtime.
 *
 * IMPORTANT (PLAN.md §6.1): proxy does NOT reliably cover Server Actions,
 * because an action POSTs to the route that invoked it. Every Server Action
 * must therefore re-check authorization itself. This file is a first line of
 * defence, never the only one.
 */

/** Routes reachable without a session. Everything else requires auth. */
const isPublicRoute = createRouteMatcher([
  "/",
  "/features(.*)",
  "/how-it-works",
  "/pricing",
  "/free-scanner(.*)",
  "/blog(.*)",
  "/guides(.*)",
  "/resources",
  "/about",
  "/contact",
  "/legal(.*)",
  "/bot",
  "/login(.*)",
  "/signup(.*)",
  "/api/webhooks(.*)",
  "/api/public(.*)",
  // Liveness and readiness probes are called by the platform with no session.
  // Gating these behind auth makes every deploy fail its health check.
  "/api/health(.*)",
  /*
   * A shared report link is a bearer credential handed to someone outside the
   * agency — the token IS the authorisation (§6.8). It resolves exactly one
   * report and lives outside every authenticated route group.
   */
  "/reports/shared(.*)",
]);

/**
 * The client portal uses its own magic-link session scheme (PLAN.md §6.10),
 * not Clerk. Skip Clerk entirely for these paths.
 */
const isPortalRoute = createRouteMatcher(["/portal(.*)", "/api/portal(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  if (isPortalRoute(req)) return;
  if (!isPublicRoute(req)) await auth.protect();
});

export const config = {
  matcher: [
    // Everything except Next internals and static assets
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ico|woff2?)).*)",
    "/(api|trpc)(.*)",
    // Clerk's auto-proxy path — required, must come after the API matcher
    "/__clerk/:path*",
  ],
};
