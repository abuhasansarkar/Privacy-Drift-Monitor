import type { ConsentPhase, RecordedCookie } from "@pdm/scanner/types";
import {
  executed,
  fingerprint,
  NO_EVIDENCE,
  type Rule,
  type Severity,
} from "./types";

/**
 * HYGIENE AND SCAN-HEALTH RULES — PDM-R020 … PDM-R025, PLAN.md §4.11.
 *
 * Two families that share a property worth stating: none of them are about
 * consent, and none of them should ever outrank a consent finding. Their
 * precedence values are all low for that reason.
 *
 * ⚠️ R023, R024 AND R025 DESCRIBE **OUR** SCAN, not the site's behaviour. They
 * exist so an agency can tell "nothing was found" apart from "nothing was
 * looked at" — which is the distinction P5 exists to protect.
 */

/** §4.11 R021: 13 months, expressed in days. */
const LONG_COOKIE_DAYS = 395;

/** PDM-R020 — a third-party font or CDN request before consent. */
export const R020: Rule = {
  id: "PDM-R020",
  category: "PRE_CONSENT_TRACKING",
  precedence: 30,
  evaluate(context) {
    if (!executed(context, "NO_CONSENT")) return [];

    const fonts = context.requests.filter(
      (request) =>
        request.consentPhase === "NO_CONSENT" &&
        request.isThirdParty &&
        (request.resourceType === "font" || request.resourceType === "stylesheet"),
    );
    if (fonts.length === 0) return [];

    // One finding per domain, not per file — a font family is a dozen requests
    // to the same host, and a dozen findings for it is noise.
    const byDomain = new Map<string, typeof fonts>();
    for (const request of fonts) {
      byDomain.set(request.registrableDomain, [
        ...(byDomain.get(request.registrableDomain) ?? []),
        request,
      ]);
    }

    return [...byDomain.entries()].map(([domain, requests]) => ({
      ruleId: this.id,
      category: this.category,
      // ⚠️ LOW, and it stays Low. A font CDN is a privacy consideration worth
      // surfacing, not a tracking finding — inflating it would train agencies
      // to skim the severity column.
      severity: "LOW" as Severity,
      fingerprint: fingerprint([this.id, domain]),
      title: `Third-party font or stylesheet loaded before consent — ${domain}`,
      subject: domain,
      consentPhase: "NO_CONSENT" as ConsentPhase,
      evidenceRefs: {
        requestUrls: requests.slice(0, 10).map((request) => request.url),
        cookieNames: [],
        storageKeys: [],
      },
      rationale: `${requests.length} request${
        requests.length === 1 ? "" : "s"
      } to ${domain} were recorded before consent was given. This exposes visitor IP addresses to that provider.`,
      recommendedAction: "Consider self-hosting fonts and stylesheets.",
    }));
  },
};

/** PDM-R021 — a cookie whose lifetime exceeds 13 months. */
export const R021: Rule = {
  id: "PDM-R021",
  category: "COOKIE_BEHAVIOR",
  precedence: 20,
  evaluate(context) {
    const byName = new Map<string, RecordedCookie>();
    for (const cookie of context.cookies) {
      if ((cookie.durationDays ?? 0) > LONG_COOKIE_DAYS) byName.set(cookie.name, cookie);
    }

    return [...byName.values()].map((cookie) => ({
      ruleId: this.id,
      category: this.category,
      // Info: §4.11 is explicit that this carries "no action implied".
      severity: "INFO" as Severity,
      fingerprint: fingerprint([this.id, cookie.domain, cookie.name]),
      title: `Cookie with a long lifetime — ${cookie.name}`,
      subject: cookie.name,
      consentPhase: cookie.consentPhase,
      evidenceRefs: { requestUrls: [], cookieNames: [cookie.name], storageKeys: [] },
      rationale: `Set on ${cookie.domain} with a lifetime of ${cookie.durationDays} days.`,
      recommendedAction: "Review whether this duration is necessary.",
    }));
  },
};

/**
 * PDM-R022 — insecure transport.
 *
 * ⚠️ TWO DISTINCT CASES, ONE RULE (§4.11): the page itself served over HTTP, or
 * an HTTPS page pulling an HTTP subresource. Both mean the same thing to a
 * visitor, and splitting them would double the finding on a site that has both.
 */
export const R022: Rule = {
  id: "PDM-R022",
  category: "TRANSPORT_SECURITY",
  precedence: 35,
  evaluate(context) {
    const pageInsecure = context.scan?.url.startsWith("http://") ?? false;
    const mixed = context.requests.filter((request) =>
      request.url.startsWith("http://"),
    );

    if (!pageInsecure && mixed.length === 0) return [];

    return [
      {
        ruleId: this.id,
        category: this.category,
        severity: "MEDIUM" as Severity,
        fingerprint: fingerprint([this.id, pageInsecure ? "document" : "mixed"]),
        title: pageInsecure
          ? "This website was reached over an insecure connection"
          : "Insecure requests were observed on a secure page",
        subject: "transport",
        consentPhase: "NO_CONSENT" as ConsentPhase,
        evidenceRefs: {
          requestUrls: mixed.slice(0, 10).map((request) => request.url),
          cookieNames: [],
          storageKeys: [],
        },
        rationale: pageInsecure
          ? "The monitored address was served over HTTP, so traffic between visitors and this site is not encrypted."
          : `${mixed.length} request${mixed.length === 1 ? " was" : "s were"} made over HTTP from a page served over HTTPS.`,
        recommendedAction:
          "Enable HTTPS and redirect all traffic to it, including subresources.",
      },
    ];
  },
};

/**
 * PDM-R023 — we have been unable to scan this website repeatedly.
 *
 * ⚠️ THE THRESHOLD IS THREE (§4.11), and the count comes from the scan record
 * rather than being derived here. A rule that queried history would be a rule
 * that can produce a fact, which P6 forbids.
 */
export const R023: Rule = {
  id: "PDM-R023",
  category: "SCAN_HEALTH",
  precedence: 25,
  evaluate(context) {
    if ((context.scan?.consecutiveFailures ?? 0) < 3) return [];

    return [
      {
        ruleId: this.id,
        category: this.category,
        severity: "HIGH" as Severity,
        fingerprint: fingerprint([this.id]),
        title: "We have been unable to scan this website",
        subject: "scan",
        consentPhase: "NO_CONSENT" as ConsentPhase,
        evidenceRefs: NO_EVIDENCE,
        rationale: `${context.scan?.consecutiveFailures} consecutive scans failed to complete. No findings can be produced until it succeeds.`,
        recommendedAction:
          "Check that the site is reachable and is not blocking our scanner.",
      },
    ];
  },
};

/**
 * PDM-R024 — the scan was incomplete.
 *
 * ⚠️ THIS RULE IS THE UI'S HANDLE ON `PARTIAL` (P5). Without it, an incomplete
 * scan looks like a clean one to anyone reading the findings list — which is
 * precisely the false clean verdict §0.2 P5 forbids.
 */
export const R024: Rule = {
  id: "PDM-R024",
  category: "SCAN_HEALTH",
  precedence: 15,
  evaluate(context) {
    const incomplete = context.phases.filter((phase) => phase.status !== "EXECUTED");
    if (incomplete.length === 0) return [];

    return [
      {
        ruleId: this.id,
        category: this.category,
        severity: "INFO" as Severity,
        fingerprint: fingerprint([
          this.id,
          // The SET of skipped phases, sorted, so the same partial scan shape
          // dedupes across nights rather than reopening every time.
          incomplete
            .map((phase) => phase.phase)
            .sort()
            .join(","),
        ]),
        title: "Some consent tests could not be completed on this scan",
        subject: "scan",
        consentPhase: "NO_CONSENT" as ConsentPhase,
        evidenceRefs: NO_EVIDENCE,
        rationale: incomplete
          .map(
            (phase) =>
              `${phase.phase}: ${phase.errorCode ?? phase.status.toLowerCase()}`,
          )
          .join(" · "),
        recommendedAction:
          "See which tests were skipped and why. Anything depending on them is reported as could not be determined.",
      },
    ];
  },
};

/** Scan failures that mean the site itself did not answer. */
const UNREACHABLE_CODES = new Set([
  "DNS_NXDOMAIN",
  "NAV_TIMEOUT",
  "NETWORK_RESET",
  "SCAN_TIMEOUT",
  "TLS_NAME_MISMATCH",
  "TLS_INVALID_CERT",
]);

/** PDM-R025 — the website could not be reached at all. */
export const R025: Rule = {
  id: "PDM-R025",
  category: "SCAN_HEALTH",
  precedence: 28,
  evaluate(context) {
    if (context.scan?.status !== "FAILED") return [];
    const code = context.scan.errorCode;
    if (!code || !UNREACHABLE_CODES.has(code)) return [];

    return [
      {
        ruleId: this.id,
        category: this.category,
        severity: "HIGH" as Severity,
        fingerprint: fingerprint([this.id, code]),
        title: "This website could not be reached",
        subject: "scan",
        consentPhase: "NO_CONSENT" as ConsentPhase,
        evidenceRefs: NO_EVIDENCE,
        rationale: `The scan ended with ${code}. Nothing was recorded, so no findings were produced for this run.`,
        recommendedAction: "Verify the site is online and the address is correct.",
      },
    ];
  },
};

export const HYGIENE_RULES: readonly Rule[] = [R020, R021, R022, R023, R024, R025];
