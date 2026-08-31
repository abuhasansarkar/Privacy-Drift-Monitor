import type { ConsentPhase, RecordedCookie } from "@pdm/scanner/types";
import {
  executed,
  fingerprint,
  type Finding,
  type Rule,
  type Severity,
} from "./types";

/**
 * OURS, NOT THE PLAN'S — the same convention as the `X`-numbered fixtures.
 *
 * §4.11's 25 rows cover cookies AFTER a consent decision (R006, R008) but not
 * cookies and storage written BEFORE anyone was asked. That is a real,
 * frequently-observed shape and the evidence for it is already recorded, so the
 * rules exist — under `PDM-X` ids, so nobody mistakes one for a plan row and so
 * a future §4.11 revision can claim its own numbers cleanly.
 */

function byName(cookies: readonly RecordedCookie[]): RecordedCookie[] {
  const map = new Map<string, RecordedCookie>();
  for (const cookie of cookies) map.set(cookie.name, cookie);
  return [...map.values()];
}

/** PDM-X01 — a non-essential cookie was set before consent. */
export const X01: Rule = {
  id: "PDM-X01",
  category: "COOKIE_BEHAVIOR",
  precedence: 75,
  evaluate(context) {
    if (!executed(context, "NO_CONSENT")) return [];

    return byName(
      context.cookies.filter((cookie) => cookie.consentPhase === "NO_CONSENT"),
    )
      // A session cookie with no expiry is very often the site's own login or
      // CSRF cookie. Reporting those is how a findings list becomes noise.
      .filter((cookie) => cookie.isThirdParty || cookie.durationDays !== null)
      .map((cookie) => ({
        ruleId: this.id,
        category: this.category,
        severity: (cookie.isThirdParty ? "HIGH" : "MEDIUM") as Severity,
        fingerprint: fingerprint([this.id, cookie.domain, cookie.name]),
        title: `Cookie set before consent — ${cookie.name}`,
        subject: cookie.name,
        consentPhase: "NO_CONSENT" as ConsentPhase,
        evidenceRefs: { requestUrls: [], cookieNames: [cookie.name], storageKeys: [] },
        rationale: `Set on ${cookie.domain} before any consent interaction${
          cookie.durationDays === null ? "" : `, with a lifetime of ${cookie.durationDays} days`
        }.`,
        recommendedAction:
          "Move whatever sets this cookie behind consent, then re-scan to verify.",
      })) satisfies Finding[];
  },
};

/** PDM-X02 — browser storage was written before consent. */
export const X02: Rule = {
  id: "PDM-X02",
  category: "COOKIE_BEHAVIOR",
  precedence: 72,
  evaluate(context) {
    if (!executed(context, "NO_CONSENT")) return [];

    const byKey = new Map<string, (typeof context.storage)[number]>();
    for (const entry of context.storage) {
      if (entry.consentPhase === "NO_CONSENT") byKey.set(entry.key, entry);
    }

    return [...byKey.values()].map((entry) => ({
      ruleId: this.id,
      category: this.category,
      // ⚠️ MEDIUM, not High. localStorage is used for genuinely functional
      // things — a theme preference, a dismissed banner — far more often than
      // cookies are, and we cannot tell which from the key alone.
      severity: "MEDIUM" as Severity,
      fingerprint: fingerprint([this.id, entry.origin, entry.key]),
      title: `Browser storage written before consent — ${entry.key}`,
      subject: entry.key,
      consentPhase: "NO_CONSENT" as ConsentPhase,
      evidenceRefs: { requestUrls: [], cookieNames: [], storageKeys: [entry.key] },
      rationale: `A ${entry.storageType} entry was written on ${entry.origin} before any consent interaction.`,
      recommendedAction:
        "Check what writes this key, and whether it needs to run before consent.",
    }));
  },
};

export const EXTRA_RULES: readonly Rule[] = [X01, X02];
