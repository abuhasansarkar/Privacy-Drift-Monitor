import type { init as SentryInit } from "@sentry/nextjs";

/**
 * SENTRY CONFIGURATION — PLAN.md Part X §10.8, Phase 7 task 7.3.
 *
 * ⚠️ ONE SHAPE, SHARED BY THE SERVER AND THE BROWSER, so the redaction rules
 * cannot diverge. A privacy product that ships its customers' data to an error
 * reporter has failed at the thing it sells, and the two configs drifting apart
 * is exactly how that happens — one of them gets a new `beforeSend` and the
 * other does not.
 *
 * ⚠️ IT IS INERT WITHOUT A DSN, AND THAT IS DELIBERATE. §12.3 puts Sentry in
 * Phase 7 and the DSN is unset everywhere until production exists. A
 * half-configured error reporter is worse than none because it looks like
 * coverage — so `sentryOptions()` returns null rather than initialising against
 * nothing.
 */

/** What must never leave this process (§10.6, §9.6). */
const REDACTED = "[redacted]";

const SENSITIVE_KEYS = [
  "password",
  "secret",
  "token",
  "authorization",
  "cookie",
  "apikey",
  "api_key",
  "stripe",
  "clerk",
  /*
   * ⚠️ SCANNED-SITE DATA IS THE ONE NOBODY EXPECTS. An error thrown inside the
   * recorder carries request URLs and cookie names belonging to somebody
   * else's website — data our own customer is paying us to treat carefully,
   * and which we have no right to hand to a third party for debugging.
   */
  "cookievalue",
  "valuehash",
  "evidence",
  "payload",
];

function scrub(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((entry) => scrub(entry, depth + 1));

  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    const sensitive = SENSITIVE_KEYS.some((needle) =>
      key.toLowerCase().includes(needle),
    );
    // ⚠️ THE KEY IS KEPT AND THE VALUE IS REPLACED. Dropping the key would make
    // an error report claim the field was absent, which sends whoever is
    // debugging down the wrong path.
    out[key] = sensitive ? REDACTED : scrub(entry, depth + 1);
  }
  return out;
}

type SentryOptions = Parameters<typeof SentryInit>[0];

/**
 * ⚠️ EMPTY IS UNSET, AND `??` DOES NOT SAY THAT. `.env.example` ships both DSN
 * variables declared and blank, so `NEXT_PUBLIC_SENTRY_DSN` is the empty
 * STRING rather than undefined — and `??` only falls through on null or
 * undefined. The first version used it, so setting `SENTRY_DSN` alone left
 * Sentry silently inert with no way to tell from the outside. A test caught it;
 * in production the symptom would have been "we get no error reports" weeks
 * later.
 */
function env(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value : undefined;
}

export function sentryOptions(): SentryOptions | null {
  const dsn = env("NEXT_PUBLIC_SENTRY_DSN") ?? env("SENTRY_DSN");
  if (!dsn) return null;

  return {
    dsn,
    environment: env("SENTRY_ENVIRONMENT") ?? process.env.NODE_ENV,
    release: env("GIT_SHA"),

    /*
     * ⚠️ TRACING SAMPLED AT 10%, ERRORS AT 100%. Every error matters; every
     * trace does not, and a scan-heavy workload generates a great many spans.
     */
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),

    /*
     * ⚠️ `sendDefaultPii: false` IS THE DEFAULT AND IS RESTATED HERE ON
     * PURPOSE. Turning it on attaches IP addresses and user identifiers to
     * every event. §10.6 hashes IPs everywhere else in this codebase; an error
     * reporter that quietly collects them undoes that.
     */
    sendDefaultPii: false,

    beforeSend(event) {
      if (event.request) {
        // The URL of a page in OUR app is fine; its query string may carry a
        // free-scan token or a report share token, both of which are bearer
        // credentials.
        if (event.request.query_string) event.request.query_string = REDACTED;
        if (event.request.cookies) event.request.cookies = REDACTED as never;
        if (event.request.headers) {
          event.request.headers = scrub(event.request.headers) as Record<string, string>;
        }
        if (event.request.data) event.request.data = scrub(event.request.data);
      }
      if (event.extra) event.extra = scrub(event.extra) as Record<string, unknown>;
      if (event.contexts) event.contexts = scrub(event.contexts) as typeof event.contexts;
      return event;
    },

    /*
     * ⚠️ BREADCRUMBS CARRY REQUEST BODIES. A `fetch` breadcrumb from the
     * scanner names the third-party endpoint it recorded; a console breadcrumb
     * can carry anything anyone logged. Scrubbed the same way as the event.
     */
    beforeBreadcrumb(breadcrumb) {
      if (breadcrumb.data) breadcrumb.data = scrub(breadcrumb.data) as typeof breadcrumb.data;
      return breadcrumb;
    },
  };
}

/** True when Sentry is actually reporting — surfaced on `/admin/system-health`. */
export function sentryConfigured(): boolean {
  return sentryOptions() !== null;
}
