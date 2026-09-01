import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";

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

/**
 * ⚠️ THE STATICALLY PRERENDERED MARKETING PAGES. §3.2 requires them to be
 * static and they are (`○` in the build output) — which is exactly why they
 * cannot take a nonce. See `contentSecurityPolicy` below.
 */
const isStaticMarketingRoute = createRouteMatcher([
  "/",
  "/features(.*)",
  "/how-it-works",
  "/pricing",
  "/free-scanner",
  "/blog(.*)",
  "/guides(.*)",
  "/resources",
  "/about",
  "/contact",
  "/legal(.*)",
  "/bot",
]);

/**
 * CONTENT SECURITY POLICY — PLAN.md Part X §10.1, Phase 7 task 7.1.
 *
 * ⚠️ **TWO POLICIES, BECAUSE A NONCE FORCES DYNAMIC RENDERING.** Next's own CSP
 * guide is explicit: "your page must be dynamically rendered... Static pages
 * are generated at build time, when no request or response headers exist — so
 * no nonce can be injected." §10.1 asks for a per-request nonce and §3.2 asks
 * for statically prerendered marketing pages, and those two requirements cannot
 * both hold on the same route. Sending a nonce policy to a prerendered page
 * does not weaken it — it BREAKS it, because the inline bootstrap script in the
 * cached HTML carries last build's nonce, or none at all.
 *
 * So:
 *
 *   Dynamic surfaces (`/app`, `/admin`, `/portal`, auth) — the strict
 *   nonce policy §10.1 specifies. These are the pages that render tenant data,
 *   scanned-site strings and anything a user typed, which is the entire threat
 *   model CSP addresses.
 *
 *   Static marketing pages — the same policy with `'unsafe-inline'` in place of
 *   the nonce. The trade is deliberate and narrow: these pages render NO
 *   user-controlled data whatsoever. Every string on them comes from
 *   `packages/shared/src/copy/en.ts` or `content/`, both of which are in the
 *   repository and pass through code review. `/free-scanner/[token]`, which
 *   renders data derived from a third-party website, is dynamic and gets the
 *   strict policy.
 *
 * ⚠️ `'unsafe-eval'` IN DEVELOPMENT ONLY. React uses `eval` in development to
 * reconstruct server-side error stacks in the browser; production does not.
 * Leaving it on in production would remove most of the value of `script-src`.
 */
function contentSecurityPolicy(nonce: string | null): string {
  const isDev = process.env.NODE_ENV === "development";

  const scriptSrc = [
    "'self'",
    nonce ? `'nonce-${nonce}'` : "'unsafe-inline'",
    /*
     * ⚠️ NO `'strict-dynamic'`, AND THAT IS §10.1's OWN POLICY RATHER THAN AN
     * OMISSION. Next's CSP example includes it; adding it here broke sign-in
     * outright, because `'strict-dynamic'` makes a browser IGNORE every host
     * allowlist in the directive — so `https://*.clerk.accounts.dev` stopped
     * meaning anything and Clerk's loader was refused. §10.1's policy names the
     * hosts explicitly, which only works without it.
     */
    isDev ? "'unsafe-eval'" : "",
    "https://*.clerk.accounts.dev",
    "https://challenges.cloudflare.com",
  ]
    .filter(Boolean)
    .join(" ");

  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    /*
     * ⚠️ `'unsafe-inline'` FOR STYLES IS §10.1's OWN CHOICE, and it is far less
     * dangerous than the script equivalent: an injected style can deface a page
     * or, at worst, exfiltrate through a background-image URL, where an
     * injected script owns the session. Tailwind's `@theme` and Next's inlined
     * critical CSS both emit style tags with no stable hash, so the
     * alternative is a nonce on every one of them — which would break the
     * static pages for the same reason the script nonce does.
     */
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.s3.amazonaws.com https://img.clerk.com",
    // Self-hosted fonts only (§11.2) — `data:` covers the inlined subset.
    "font-src 'self' data:",
    `connect-src 'self' https://*.clerk.accounts.dev https://api.stripe.com wss://*.clerk.accounts.dev${
      isDev ? " ws://localhost:* http://localhost:*" : ""
    }`,
    "frame-src https://js.stripe.com https://challenges.cloudflare.com",
    /*
     * ⚠️ `worker-src` IS NOT IN §10.1's LIST AND IS REQUIRED ANYWAY. Without
     * it, a worker falls back through `child-src` to `script-src`, where a
     * `blob:` URL is not allowed — and Clerk creates its session worker from
     * exactly that. The symptom is a console error on every authenticated
     * page load, which is the kind of noise that trains people to ignore CSP
     * reports. `blob:` here is a worker the page itself constructed, not a
     * third-party origin.
     */
    "worker-src 'self' blob:",
    // Clickjacking: nothing may frame us, ever. `X-Frame-Options` below repeats
    // it for browsers that predate `frame-ancestors`.
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self' https://checkout.stripe.com",
    "object-src 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}

/**
 * ⚠️ ONLY CSP IS SET HERE. The other five headers of §10.1 moved to
 * `next.config.ts`'s `headers()`, because Clerk's `auth.protect()` returns its
 * own redirect before this function runs — so anything set here is absent from
 * every unauthenticated bounce. CSP cannot follow them: it needs a per-request
 * nonce, and `next.config.ts` is evaluated once at build time.
 */
function applyCsp(response: NextResponse, csp: string): NextResponse {
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

/**
 * ⚠️ THE NONCE IS PASSED FORWARD ON THE **REQUEST** HEADERS AS WELL AS THE
 * RESPONSE. Next extracts it from the request's own CSP header during
 * rendering and applies it to the framework scripts automatically; setting it
 * only on the response gives the browser a policy that Next's own bootstrap
 * script then violates.
 */
function respond(request: NextRequest): NextResponse {
  if (isStaticMarketingRoute(request)) {
    return applyCsp(NextResponse.next(), contentSecurityPolicy(null));
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = contentSecurityPolicy(nonce);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  return applyCsp(NextResponse.next({ request: { headers: requestHeaders } }), csp);
}

export default clerkMiddleware(async (auth, req) => {
  if (isPortalRoute(req)) return respond(req);
  if (!isPublicRoute(req)) await auth.protect();
  return respond(req);
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
