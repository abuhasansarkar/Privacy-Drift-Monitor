import type { ConsentPhase } from "@pdm/scanner/types";
import {
  executed,
  fingerprint,
  type Finding,
  type Rule,
  type RuleContext,
  type Severity,
} from "./types";

/**
 * ADVANCED TECHNICAL RULES — PDM-R038 … PDM-R048, PDM-R050 (PLAN-V2 Part III).
 *
 * Covers CNAME cloaking, Supercookies/IndexedDB, Fingerprinting,
 * GTM Re-injection, and Security hygiene.
 */

/**
 * PDM-R038 — CNAME Cloaked Third-Party Tracker Detected.
 *
 * ⚠️ THIS READS RECORDED DNS EVIDENCE (`context.cnames`), and it has to.
 * The previous implementation searched each request's HTTP `redirectChain` for
 * the literal substring `"cname"`. CNAME cloaking is a DNS-level arrangement:
 * the browser resolves `metrics.client.com` to `client.sc.omtrdc.net` and then
 * makes ONE request that looks entirely first-party. There is no redirect and
 * nothing in the chain ever says "cname", so the rule could not fire on a real
 * cloaked host — while `packages/scanner/src/net/cname.ts`, a working resolver
 * written for exactly this, was called from nowhere.
 *
 * ⚠️ NO EVIDENCE MEANS NO FINDING. `context.cnames` is undefined for scans
 * recorded before resolution existed, and empty when DNS timed out. Neither is
 * "nothing is cloaked", so neither produces a clean verdict here (P5).
 */
export const R038: Rule = {
  id: "PDM-R038",
  category: "CLOAKING",
  precedence: 89,
  evaluate(context: RuleContext): Finding[] {
    const cloaked = (context.cnames ?? []).filter((entry) => entry.isCloaked);
    if (cloaked.length === 0) return [];

    return cloaked.flatMap((entry) => {
      /*
       * Tie the DNS fact back to the requests that actually went to the host,
       * so the finding cites recorded traffic rather than a lookup on its own.
       * A host we resolved but never contacted is not a finding.
       */
      const requests = context.requests.filter(
        (request) => request.host.toLowerCase() === entry.host.toLowerCase(),
      );
      if (requests.length === 0) return [];

      // The earliest phase it appeared in — cloaking before consent is the
      // more serious observation, and precedence dedupes the rest.
      const earliest = requests.reduce((best, candidate) =>
        candidate.timestampMs < best.timestampMs ? candidate : best,
      );

      return [
        {
          ruleId: "PDM-R038",
          category: "CLOAKING",
          severity: "HIGH" as Severity,
          fingerprint: fingerprint(["PDM-R038", entry.host, earliest.consentPhase]),
          title: `First-party subdomain ${entry.host} resolves via CNAME to ${
            entry.canonicalHost ?? "an external network"
          }`,
          subject: entry.host,
          consentPhase: earliest.consentPhase,
          evidenceRefs: {
            requestUrls: requests.map((request) => request.url),
            cookieNames: [],
            storageKeys: [],
          },
          rationale:
            `The host ${entry.host} appears first-party to the browser, but DNS resolves it ` +
            `through ${entry.chain.join(" → ")}. Requests to it are treated as same-site, so ` +
            "cookies set in the response are first-party and are not subject to third-party " +
            "cookie restrictions.",
          recommendedAction:
            "Disclose CNAME cloaked vendor endpoints and ensure consent gating is applied to custom subdomains.",
        } satisfies Finding,
      ];
    });
  },
};

/** PDM-R039 — Supercookie / IndexedDB Tracking Mechanism. */
export const R039: Rule = {
  id: "PDM-R039",
  category: "STORAGE",
  precedence: 82,
  evaluate(context: RuleContext): Finding[] {
    const phase: ConsentPhase = "NO_CONSENT";
    if (!executed(context, phase)) return [];

    return context.storage
      .filter((s) => s.consentPhase === phase && s.storageType === "local")
      .map((s) => {
        return {
          ruleId: "PDM-R039",
          category: "STORAGE",
          severity: "HIGH" as Severity,
          fingerprint: fingerprint(["PDM-R039", s.origin, s.key]),
          title: `Persistent tracking identifier stored in ${s.storageType} pre-consent`,
          subject: s.origin,
          consentPhase: phase,
          evidenceRefs: {
            requestUrls: [],
            cookieNames: [],
            storageKeys: [s.key],
          },
          rationale:
            "Under ePrivacy Directive Article 5(3), storing persistent client-side state in IndexedDB/CacheStorage requires prior consent.",
          recommendedAction:
            "Prevent writing to IndexedDB and persistent cache storage prior to affirmative user consent.",
        } satisfies Finding;
      });
  },
};

/** PDM-R042 — Post-Interaction Delayed Tracker Spike. */
export const R042: Rule = {
  id: "PDM-R042",
  category: "INTERACTION",
  precedence: 84,
  evaluate(context: RuleContext): Finding[] {
    const phase: ConsentPhase = "INTERACTIVE_ACTION";
    if (!executed(context, phase)) return [];

    const interactiveRequests = context.requests.filter((r) => r.consentPhase === phase && r.isThirdParty);
    if (interactiveRequests.length >= 5) {
      return [
        {
          ruleId: "PDM-R042",
          category: "INTERACTION",
          severity: "HIGH",
          fingerprint: fingerprint(["PDM-R042", "interactive-spike"]),
          title: "Surge of third-party trackers fired immediately upon user scroll/interaction",
          subject: "Interactive Tracker Surge",
          consentPhase: phase,
          evidenceRefs: {
            requestUrls: interactiveRequests.slice(0, 5).map((r) => r.url),
            cookieNames: [],
            storageKeys: [],
          },
          rationale:
            "Multiple third-party marketing tags loaded dynamically upon initial page scroll without explicit consent.",
          recommendedAction:
            "Ensure lazy-loaded tags respect user consent state rather than triggering automatically on scroll.",
        },
      ];
    }
    return [];
  },
};

/** PDM-R044 — GTM Container Re-Injection Bypass. */
export const R044: Rule = {
  id: "PDM-R044",
  category: "TAG_MANAGER",
  precedence: 96,
  evaluate(context: RuleContext): Finding[] {
    const gtmContainers = context.requests.filter(
      (r) => r.url.includes("googletagmanager.com/gtm.js?id=GTM-") || r.url.includes("tagmanager.google.com"),
    );

    // If multiple distinct GTM container IDs are injected
    const uniqueIds = new Set(
      gtmContainers.map((r) => {
        const match = r.url.match(/id=(GTM-[A-Z0-9]+)/);
        return match ? match[1] : null;
      }).filter(Boolean),
    );

    if (uniqueIds.size > 1) {
      return [
        {
          ruleId: "PDM-R044",
          category: "TAG_MANAGER",
          severity: "CRITICAL",
          fingerprint: fingerprint(["PDM-R044", "multiple-gtm-containers"]),
          title: `Multiple distinct Google Tag Manager containers injected (${[...uniqueIds].join(", ")})`,
          subject: "GTM Container Governance",
          consentPhase: "NO_CONSENT",
          evidenceRefs: {
            requestUrls: gtmContainers.map((r) => r.url),
            cookieNames: [],
            storageKeys: [],
          },
          rationale:
            "Multiple secondary tag manager containers detected on page, which frequently circumvents primary CMP blocking rules.",
          recommendedAction:
            "Consolidate all tag deployment into a single governed container with enforced Consent Mode v2 triggers.",
        },
      ];
    }

    return [];
  },
};

/** PDM-R046 — Excessive Third-Party Script Payload Weight. */
export const R046: Rule = {
  id: "PDM-R046",
  category: "PERFORMANCE",
  precedence: 30,
  evaluate(context: RuleContext): Finding[] {
    const MAX_BYTES = 1.5 * 1024 * 1024; // 1.5MB
    const total3PBytes = context.requests
      .filter((r) => r.isThirdParty && r.transferSize)
      .reduce((sum, r) => sum + (r.transferSize ?? 0), 0);

    if (total3PBytes > MAX_BYTES) {
      return [
        {
          ruleId: "PDM-R046",
          category: "PERFORMANCE",
          severity: "LOW",
          fingerprint: fingerprint(["PDM-R046", "excessive-payload"]),
          title: `Third-party script transfer size exceeds ${(total3PBytes / (1024 * 1024)).toFixed(1)}MB`,
          subject: "Third-Party Script Weight",
          consentPhase: "NO_CONSENT",
          evidenceRefs: {
            requestUrls: context.requests.filter((r) => r.isThirdParty).slice(0, 3).map((r) => r.url),
            cookieNames: [],
            storageKeys: [],
          },
          rationale: "Heavy unconsented third-party script payloads degrade Core Web Vitals and user performance.",
          recommendedAction: "Audit and eliminate redundant third-party tag libraries.",
        },
      ];
    }

    return [];
  },
};

/** PDM-R047 — Third-Party Script Loaded Over Insecure HTTP. */
export const R047: Rule = {
  id: "PDM-R047",
  category: "SECURITY",
  precedence: 86,
  evaluate(context: RuleContext): Finding[] {
    return context.requests
      .filter((r) => r.isThirdParty && r.url.startsWith("http://"))
      .map((r) => {
        return {
          ruleId: "PDM-R047",
          category: "SECURITY",
          severity: "HIGH" as Severity,
          fingerprint: fingerprint(["PDM-R047", r.host, r.consentPhase]),
          title: `Third-party script loaded over unencrypted HTTP: ${r.host}`,
          subject: r.host,
          consentPhase: r.consentPhase,
          evidenceRefs: {
            requestUrls: [r.url],
            cookieNames: [],
            storageKeys: [],
          },
          rationale: "Loading third-party scripts over cleartext HTTP exposes site visitors to active man-in-the-middle tampering.",
          recommendedAction: "Migrate all script tags and tracking beacons to HTTPS.",
        } satisfies Finding;
      });
  },
};

/** PDM-R048 — SameSite=None Cookie Missing Secure Flag. */
export const R048: Rule = {
  id: "PDM-R048",
  category: "COOKIE_BEHAVIOR",
  precedence: 72,
  evaluate(context: RuleContext): Finding[] {
    return context.cookies
      .filter((c) => c.sameSite?.toLowerCase() === "none" && !c.secure)
      .map((c) => {
        return {
          ruleId: "PDM-R048",
          category: "COOKIE_BEHAVIOR",
          severity: "MEDIUM" as Severity,
          fingerprint: fingerprint(["PDM-R048", c.name, c.consentPhase]),
          title: `Cookie '${c.name}' has SameSite=None but lacks Secure attribute`,
          subject: c.name,
          consentPhase: c.consentPhase,
          evidenceRefs: {
            requestUrls: [],
            cookieNames: [c.name],
            storageKeys: [],
          },
          rationale: "Modern browsers reject cookies with SameSite=None unless the Secure attribute is present.",
          recommendedAction: "Add the Secure flag whenever SameSite=None is set.",
        } satisfies Finding;
      });
  },
};

/** PDM-R050 — Bot Challenge / Cloudflare Turnstile Block on Geo-Egress. */
export const R050: Rule = {
  id: "PDM-R050",
  category: "SCAN_HEALTH",
  precedence: 75,
  evaluate(context: RuleContext): Finding[] {
    if (context.scan?.errorCode === "BOT_CHALLENGE") {
      return [
        {
          ruleId: "PDM-R050",
          category: "SCAN_HEALTH",
          severity: "MEDIUM",
          fingerprint: fingerprint(["PDM-R050", context.scan.url]),
          title: "Geo-egress scanning encountered bot challenge / Cloudflare Turnstile",
          subject: "Scan Geo-Egress Health",
          consentPhase: "NO_CONSENT",
          evidenceRefs: {
            requestUrls: [],
            cookieNames: [],
            storageKeys: [],
          },
          rationale: "The target website presented a Cloudflare Turnstile or bot challenge on this geographic proxy region.",
          recommendedAction: "Allowlist the scanner egress IP range in Cloudflare WAF / bot protection settings.",
        },
      ];
    }

    return [];
  },
};

/** PDM-R029 — Cookie Wall / Forcible Gating Detected. */
export const R029: Rule = {
  id: "PDM-R029",
  category: "CONSENT_FAILURE",
  precedence: 90,
  evaluate(context: RuleContext): Finding[] {
    const gating = context.domGating;
    if (!gating || !gating.isCookieWall) return [];

    return [
      {
        ruleId: "PDM-R029",
        category: "CONSENT_FAILURE",
        severity: "HIGH" as Severity,
        fingerprint: fingerprint(["PDM-R029", "DOM_GATING"]),
        title: "Cookie wall detected: site access gated without consent",
        subject: "Cookie Wall Gating",
        consentPhase: "NO_CONSENT",
        evidenceRefs: {
          requestUrls: [],
          cookieNames: [],
          storageKeys: [],
        },
        rationale:
          `Site navigation and document scrolling are forcibly gated behind a modal backdrop ` +
          `(${gating.backdropCoveragePct}% viewport coverage) with no dismissal option, ` +
          `preventing free access prior to consent choice.`,
        recommendedAction:
          "Provide an accessible dismiss mechanism or allow page browsing without mandatory consent choice.",
      } satisfies Finding,
    ];
  },
};

/** PDM-R040 — Cross-Border Data Transfer to Non-EEA Destination. */
export const R040: Rule = {
  id: "PDM-R040",
  category: "TRANSPORT_SECURITY",
  precedence: 80,
  evaluate(context: RuleContext): Finding[] {
    const preConsentRequests = context.requests.filter(
      (r) =>
        r.consentPhase === "NO_CONSENT" &&
        r.isThirdParty &&
        r.destinationCountry &&
        !["DE", "FR", "IE", "NL", "IT", "ES", "SE", "DK", "FI", "BE", "AT", "PL", "PT"].includes(
          r.destinationCountry,
        ),
    );

    if (preConsentRequests.length === 0) return [];

    // Group by destinationCountry
    const byCountry = new Map<string, typeof preConsentRequests>();
    for (const r of preConsentRequests) {
      const c = r.destinationCountry!;
      const list = byCountry.get(c) ?? [];
      list.push(r);
      byCountry.set(c, list);
    }

    return Array.from(byCountry.entries()).flatMap(([country, reqs]) => {
      const firstReq = reqs[0];
      if (!firstReq) return [];
      const hosts = Array.from(new Set(reqs.map((r) => r.host)));

      return [
        {
          ruleId: "PDM-R040",
          category: "TRANSPORT_SECURITY",
          severity: "MEDIUM" as Severity,
          fingerprint: fingerprint(["PDM-R040", country, firstReq.consentPhase]),
          title: `Third-party request sends data to non-EEA destination (${country})`,
          subject: `Cross-Border Transfer (${country})`,
          consentPhase: firstReq.consentPhase,
          evidenceRefs: {
            requestUrls: reqs.map((r) => r.url),
            cookieNames: [],
            storageKeys: [],
          },
          rationale:
            `Observed third-party network requests (${hosts.slice(0, 3).join(", ")}) ` +
            `resolving to servers located in ${country} before consent was granted.`,
          recommendedAction:
            "Review international data transfer safeguards and ensure non-EEA vendor endpoints are gated behind consent.",
        } satisfies Finding,
      ];
    });
  },
};

/** PDM-R041 — Asymmetric Consent Button Sizing / Dark Pattern. */
export const R041: Rule = {
  id: "PDM-R041",
  category: "CONSENT_MISSING",
  precedence: 74,
  evaluate(context: RuleContext): Finding[] {
    const geom = context.buttonGeometry;
    if (!geom || !geom.isAsymmetric) return [];

    return [
      {
        ruleId: "PDM-R041",
        category: "CONSENT_MISSING",
        severity: "MEDIUM" as Severity,
        fingerprint: fingerprint(["PDM-R041", String(geom.areaRatio)]),
        title: `Asymmetric consent choice: Accept button is ${geom.areaRatio}x larger than Reject`,
        subject: "Consent Button Geometry",
        consentPhase: "NO_CONSENT",
        evidenceRefs: {
          requestUrls: [],
          cookieNames: [],
          storageKeys: [],
        },
        rationale:
          `The Accept All button occupies ${geom.acceptArea}px² while Reject All occupies only ` +
          `${geom.rejectArea}px² (${geom.areaRatio}x area ratio), creating an asymmetric visual hierarchy.`,
        recommendedAction:
          "Ensure Accept All and Reject All buttons share equal visual prominence, size, and styling.",
      } satisfies Finding,
    ];
  },
};

/** PDM-R043 — Unconsented Tracking Beacons Triggered on Form Submission. */
export const R043: Rule = {
  id: "PDM-R043",
  category: "INTERACTION",
  precedence: 85,
  evaluate(context: RuleContext): Finding[] {
    const formFact = context.formSubmission;
    if (!formFact || formFact.burstRequestsDetected <= 0) return [];

    const domains = formFact.burstTrackerDomains.length > 0
      ? formFact.burstTrackerDomains.join(", ")
      : "external endpoints";

    return [
      {
        ruleId: "PDM-R043",
        category: "INTERACTION",
        severity: "HIGH" as Severity,
        fingerprint: fingerprint(["PDM-R043", domains]),
        title: "Unconsented tracker burst triggered upon synthetic form submission",
        subject: "Form Submission Tracking",
        consentPhase: "INTERACTIVE_ACTION",
        evidenceRefs: {
          requestUrls: [],
          cookieNames: [],
          storageKeys: [],
        },
        rationale:
          `Submitting a page form triggered ${formFact.burstRequestsDetected} unconsented tracking requests ` +
          `to ${domains} prior to explicit user consent.`,
        recommendedAction:
          "Ensure form submission handlers and conversion tracking pixels respect consent state before firing.",
      } satisfies Finding,
    ];
  },
};

/** PDM-R045 — Browser Fingerprinting via Canvas, Audio or WebGL. */
export const R045: Rule = {
  id: "PDM-R045",
  category: "FINGERPRINT",
  precedence: 95,
  evaluate(context: RuleContext): Finding[] {
    const fp = context.fingerprint;
    if (!fp || !fp.hasFingerprinting) return [];

    const details: string[] = [];
    if (fp.canvasAttempts > 0) details.push(`${fp.canvasAttempts} canvas data reads`);
    if (fp.audioAttempts > 0) details.push(`${fp.audioAttempts} audio oscillator operations`);
    if (fp.webglAttempts > 0) details.push(`${fp.webglAttempts} WebGL buffer extractions`);

    return [
      {
        ruleId: "PDM-R045",
        category: "FINGERPRINT",
        severity: "CRITICAL" as Severity,
        fingerprint: fingerprint(["PDM-R045", details.join("_")]),
        title: "Browser fingerprinting technique detected (Canvas/Audio/WebGL)",
        subject: "Browser Fingerprinting Trap",
        consentPhase: "NO_CONSENT",
        evidenceRefs: {
          requestUrls: [],
          cookieNames: [],
          storageKeys: [],
        },
        rationale:
          `Client-side script invoked browser fingerprinting APIs without prior consent: ` +
          `${details.join(", ")}. Stack origin snippets: ${fp.stackSnippets.slice(0, 2).join("; ") || "inline"}.`,
        recommendedAction:
          "Remove script libraries performing device/browser canvas and hardware fingerprinting.",
      } satisfies Finding,
    ];
  },
};

