/**
 * PRODUCT ANALYTICS — PLAN.md Part IX §9.6, Phase 6 task 6.8.
 *
 * §9.6: "a thin wrapper in `packages/shared/src/analytics.ts` **so the vendor
 * is swappable**". The vendor is an assumption in the plan (PostHog,
 * self-hosted, for data residency) and assumptions change; nothing outside this
 * file may import an analytics SDK.
 *
 * ⚠️ **THE PRIVACY DISCIPLINE IS ENFORCED HERE, NOT LEFT TO CALL SITES.** §9.6:
 * "we never send scanned website URLs, client names, cookie values, or evidence
 * content. Domains are hashed where they appear. **Our own product must meet
 * the standard we sell.**" A rule that lives in a paragraph gets broken by the
 * next person adding an event; `assertSafeProperties` throws in development and
 * drops the offending key in production, so the failure is loud where it can be
 * fixed and harmless where it cannot.
 *
 * ⚠️ IT IS FIRE-AND-FORGET AND NEVER THROWS INTO A REQUEST. An analytics
 * outage must not fail a scan, a checkout or a page render. Every send is
 * wrapped, and a failure is a log line.
 *
 * ⚠️ NO VENDOR IS WIRED IN YET, AND THAT IS THE HONEST STATE. `ANALYTICS_URL`
 * is unset in every environment, so `track()` records to the logger and returns.
 * The event NAMES and PROPERTY SHAPES are the part that matters now — they are
 * what the funnels in §9.7 are defined over, and getting them wrong is
 * expensive to correct after data has accumulated. Pointing this at a real
 * endpoint is one function.
 */

import { createHash } from "node:crypto";
import { logger } from "./logger";

/** §9.6's event table, verbatim. Adding one here is how it becomes trackable. */
export const ANALYTICS_EVENTS = [
  "page_viewed",
  "signup_started",
  "signup_completed",
  "agency_created",
  "onboarding_step_completed",
  "onboarding_completed",
  "website_added",
  "website_import_completed",
  "scan_started",
  "scan_completed",
  "scan_failed",
  "issue_created",
  "issue_viewed",
  "issue_status_changed",
  "issue_ignored",
  "drift_event_viewed",
  "report_generated",
  "report_downloaded",
  "ai_explanation_requested",
  "ai_fix_requested",
  "ai_output_rated",
  "client_portal_enabled",
  "portal_user_logged_in",
  "branding_configured",
  "alert_rule_created",
  "subscription_started",
  "subscription_upgraded",
  "subscription_downgraded",
  "subscription_canceled",
  "entitlement_limit_hit",
  "free_scan_submitted",
  "free_scan_completed",
  "free_scan_result_viewed",
  "free_scan_signup_clicked",
  "free_scan_email_submitted",
  "integration_interest_registered",
  /* §3.2's pricing-page events. */
  "pricing_viewed",
  "pricing_interval_toggled",
  "pricing_currency_changed",
  "pricing_plan_cta_clicked",
  "pricing_faq_opened",
  "contact_form_submitted",
] as const;

export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[number];

export type AnalyticsValue = string | number | boolean | null;
export type AnalyticsProperties = Record<string, AnalyticsValue>;

export interface AnalyticsContext {
  /** The agency, where one is resolved. Never a customer's name. */
  agencyId?: string | null;
  userId?: string | null;
  /** Anonymous surfaces (the free scanner, marketing) have neither. */
  anonymousId?: string | null;
}

/**
 * Property keys that must never carry a value, whatever it contains.
 *
 * ⚠️ A KEY BLOCKLIST, NOT A VALUE SCANNER. Trying to detect "does this string
 * look like a URL" is a losing game — it produces false negatives on the
 * interesting cases and false positives on ordinary text. Naming the keys that
 * are forbidden makes the rule reviewable and makes the fix obvious: hash it,
 * or send the shape rather than the content.
 */
const FORBIDDEN_KEYS = new Set([
  "url",
  "pageUrl",
  "page_url",
  "websiteUrl",
  "website_url",
  "domain",
  "host",
  "hostname",
  "clientName",
  "client_name",
  "agencyName",
  "agency_name",
  "email",
  "cookieValue",
  "cookie_value",
  "value",
  "evidence",
  "payload",
  "requestUrl",
  "request_url",
]);

export class AnalyticsPropertyError extends Error {
  constructor(key: string) {
    super(
      `analytics property "${key}" is forbidden by §9.6 — hash it (domainHash) or send a shape, not content`,
    );
    this.name = "AnalyticsPropertyError";
  }
}

/**
 * ⚠️ THROWS IN DEVELOPMENT AND TEST, DROPS IN PRODUCTION. The two behaviours
 * serve different people: a developer adding `domain: website.url` finds out
 * immediately, and a customer never has a page fail because of a telemetry
 * mistake that shipped anyway.
 */
export function assertSafeProperties(properties: AnalyticsProperties): AnalyticsProperties {
  const safe: AnalyticsProperties = {};
  for (const [key, value] of Object.entries(properties)) {
    if (FORBIDDEN_KEYS.has(key)) {
      if (process.env.NODE_ENV === "production") {
        logger.warn({ component: "analytics", key }, "dropped a forbidden analytics property");
        continue;
      }
      throw new AnalyticsPropertyError(key);
    }
    safe[key] = value;
  }
  return safe;
}

/**
 * §9.6: "Domains are hashed where they appear."
 *
 * ⚠️ SALTED, because the space of registrable domains is small and public. An
 * unsalted SHA-256 of `example.com` is the same everywhere and reverses with a
 * dictionary in seconds, which would make "hashed" cosmetic.
 */
export function domainHash(domain: string): string {
  const salt = process.env.ANALYTICS_SALT ?? process.env.PORTAL_TOKEN_SECRET ?? "";
  return createHash("sha256")
    .update(`${salt}:${domain.toLowerCase()}`)
    .digest("hex")
    .slice(0, 32);
}

export interface AnalyticsTransport {
  send(payload: {
    event: AnalyticsEvent;
    properties: AnalyticsProperties;
    context: AnalyticsContext;
    timestamp: string;
  }): Promise<void>;
}

let transport: AnalyticsTransport | null = null;

/** Injected at startup, and in tests. No vendor SDK is imported by default. */
export function setAnalyticsTransport(next: AnalyticsTransport | null): void {
  transport = next;
}

/**
 * Records one event. Never throws, never blocks a response.
 *
 * ⚠️ `void track(...)` AT EVERY CALL SITE. Awaiting telemetry puts a network
 * round trip on the critical path of a checkout or a scan, which is a real
 * latency cost for a number nobody reads in real time.
 */
export async function track(
  event: AnalyticsEvent,
  properties: AnalyticsProperties = {},
  context: AnalyticsContext = {},
): Promise<void> {
  try {
    const safe = assertSafeProperties(properties);

    if (!transport) {
      // No vendor configured. Logged at debug so a developer can see the funnel
      // firing without a running analytics stack.
      logger.debug({ component: "analytics", event, ...safe }, "analytics event");
      return;
    }

    await transport.send({
      event,
      properties: safe,
      context,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof AnalyticsPropertyError) throw error;
    logger.warn({ component: "analytics", event, err: error }, "analytics send failed");
  }
}
