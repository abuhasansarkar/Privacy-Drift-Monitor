import { createHash } from "node:crypto";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";
import {
  PUBLIC_ROUTE_PATTERNS,
  STATIC_MARKETING_PATTERNS,
} from "@/lib/public-routes";
import { THEME_INIT_SCRIPT } from "@/lib/theme-script";

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

const isPublicRoute = createRouteMatcher(PUBLIC_ROUTE_PATTERNS);

/**
 * The client portal uses its own magic-link session scheme (PLAN.md §6.10),
 * not Clerk. Skip Clerk entirely for these paths.
 */
const isPortalRoute = createRouteMatcher(["/portal(.*)", "/api/portal(.*)"]);

const isStaticMarketingRoute = createRouteMatcher(STATIC_MARKETING_PATTERNS);

/**
 * SHA-256 of the one inline script the app ships, derived from the SAME
 * constant `theme-provider.tsx` renders — so the policy cannot drift from the
 * script. Editing the script changes both together.
 */
export const THEME_SCRIPT_HASH = `sha256-${createHash("sha256")
  .update(THEME_INIT_SCRIPT, "utf8")
  .digest("base64")}`;

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
 * ⚠️ **THE SPLIT ONLY BUYS ANYTHING IF THE STATIC PAGES ARE ACTUALLY STATIC**,
 * and for a while they were not. The root layout read `x-nonce` for the inline
 * theme script, which made every route in the app dynamic — so this whole
 * function was choosing between two policies for a set of pages that no longer
 * existed, and handing the weaker one to pages that were being rendered per
 * request anyway. The theme script is now allowed by HASH (below), the root
 * layout reads nothing, and the marketing pages prerender again.
 *
 * ⚠️ **THE HASH GOES IN THE STRICT POLICY ONLY, AND THAT IS A CSP RULE RATHER
 * THAN A PREFERENCE.** `'unsafe-inline'` is IGNORED by any browser that sees a
 * nonce or a hash in the same directive. Adding `'sha256-…'` to the static
 * policy would therefore switch `'unsafe-inline'` off and block Next's own
 * inline bootstrap scripts — which are baked into the prerendered HTML and can
 * carry neither a nonce nor a stable hash. The static policy keeps
 * `'unsafe-inline'` alone; the strict policy carries nonce + hash and never
 * `'unsafe-inline'`.
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
     * The pre-hydration theme script. Present ONLY on the strict policy — see
     * the `'unsafe-inline'` note in this file's header for why adding it to the
     * static policy would break that policy instead of tightening it.
     */
    nonce ? `'${THEME_SCRIPT_HASH}'` : "",
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
