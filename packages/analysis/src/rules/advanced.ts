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
