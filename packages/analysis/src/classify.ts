import type {
  ConsentPhase,
  RecordedCookie,
  RecordedRequest,
  RecordedStorageEntry,
} from "@pdm/scanner/types";

/**
 * TRACKER CLASSIFICATION — PLAN.md Part IV §4.8, Phase 3 task 3.2.
 *
 * ⚠️ INTERPRETATION ONLY. Part 0 §0.2 P6: nothing downstream of the collector
 * may add a fact. This module reads recorded requests, cookies and storage and
 * decides which VENDOR they belong to. It never infers that something happened
 * — only what an already-recorded thing was.
 *
 * ⚠️ AN UNKNOWN THIRD PARTY IS RECORDED, NOT DROPPED. A domain we have no
 * vendor for is still a third party the site contacted before consent, and
 * silently discarding it would make the evidence look cleaner than it is. It
 * becomes a detection with `vendorId: null` and the domain kept.
 *
 * ⚠️ CORROBORATION GATES CRITICAL (§4.8). A vendor matched by ONE signal type
 * is a plausible identification; matched by two independent types — a request
 * domain AND a cookie it is known to set — it is a confident one. False
 * positives are a Critical-impact risk (§12.7): one wrong "tracker detected
 * before consent" destroys the trust the product is sold on. Only the rule
 * engine may raise Critical, and only on a corroborated detection.
 */

export type SignalType = "domain" | "script" | "cookie" | "storage" | "path";

export interface VendorPattern {
  id: string;
  slug: string;
  name: string;
  category: string;
  riskLevel: string;
  domainPatterns: string[];
  scriptPatterns: string[];
  cookiePatterns: string[];
  storagePatterns: string[];
  requestPathPatterns: string[];
  baseConfidence: number;
  /** CMP, bot challenge, payment fraud — may legitimately load pre-consent. */
  isEssentialCandidate: boolean;
}

export interface Detection {
  vendorId: string | null;
  /** Set only when `vendorId` is null. See the note above. */
  unknownDomain: string | null;
  consentPhase: ConsentPhase;
  firstSeenAtMs: number;
  requestCount: number;
  /** Which signal types matched, joined — the evidence trail for the match. */
  matchedVia: string;
  confidence: number;
  corroborated: boolean;
  evidenceSummary: {
    hosts: string[];
    cookies: string[];
    storageKeys: string[];
    signals: SignalType[];
  };
}

/**
 * Glob matching for a single pattern segment.
 *
 * Patterns are `*`-globs, not regular expressions, and deliberately so: they
 * are curated data that a non-engineer edits in the admin panel, and a regex
 * from that surface is both a footgun and a ReDoS vector on a hot path that
 * runs over thousands of requests per scan.
 *
 * `*` matches any run of characters. Everything else is literal.
 */
function globToRegExp(pattern: string): RegExp {
  const escaped = pattern
    .toLowerCase()
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`);
}

/** Compiled once per classification run, not once per candidate row. */
function compile(patterns: string[]): RegExp[] {
  return patterns.map(globToRegExp);
}

function matchesAny(value: string, compiled: RegExp[]): boolean {
  const needle = value.toLowerCase();
  return compiled.some((pattern) => pattern.test(needle));
}

/**
 * ⚠️ Host matching also accepts a SUBDOMAIN of a literal pattern.
 *
 * A vendor listing `google-analytics.com` means that domain and everything
 * under it; requiring `*.google-analytics.com` as a second entry duplicates
 * every row and guarantees someone forgets one. A leading dot is required, so
 * `google-analytics.com.evil.test` does not match.
 */
function matchesHost(host: string, patterns: string[], compiled: RegExp[]): boolean {
  const needle = host.toLowerCase();
  if (matchesAny(needle, compiled)) return true;
  return patterns.some((pattern) => {
    if (pattern.includes("*")) return false;
    return needle.endsWith(`.${pattern.toLowerCase()}`);
  });
}

interface Accumulator {
  vendor: VendorPattern;
  phase: ConsentPhase;
  firstSeenAtMs: number;
  requestCount: number;
  signals: Set<SignalType>;
  hosts: Set<string>;
  cookies: Set<string>;
  storageKeys: Set<string>;
}

export interface ClassifyInput {
  vendors: readonly VendorPattern[];
  requests: readonly RecordedRequest[];
  cookies: readonly RecordedCookie[];
  storage: readonly RecordedStorageEntry[];
}

/**
 * Confidence for a match.
 *
 * Starts at the vendor's curated `baseConfidence` and is raised only by
 * CORROBORATION — never by repetition. A tracker that fired two hundred times
 * is not more likely to be that tracker than one that fired once, and letting
 * volume raise confidence would make a chatty script outrank a certain match.
 */
function confidenceFor(vendor: VendorPattern, signals: Set<SignalType>): number {
  if (signals.size >= 3) return Math.min(1, vendor.baseConfidence + 0.08);
  if (signals.size === 2) return Math.min(1, vendor.baseConfidence + 0.05);
  return vendor.baseConfidence;
}

export function classify(input: ClassifyInput): Detection[] {
  const compiled = input.vendors.map((vendor) => ({
    vendor,
    domain: compile(vendor.domainPatterns),
    script: compile(vendor.scriptPatterns),
    cookie: compile(vendor.cookiePatterns),
    storage: compile(vendor.storagePatterns),
    path: compile(vendor.requestPathPatterns),
  }));

  // Keyed by vendor AND phase: the same tracker firing before consent and after
  // Accept All is two different findings, and collapsing them would erase the
  // distinction the whole product exists to draw.
  const byVendorPhase = new Map<string, Accumulator>();
  const unknownByPhase = new Map<string, {
    phase: ConsentPhase;
    domain: string;
    firstSeenAtMs: number;
    requestCount: number;
    hosts: Set<string>;
  }>();

  function accumulate(
    vendor: VendorPattern,
    phase: ConsentPhase,
    signal: SignalType,
    atMs: number,
  ): Accumulator {
    const key = `${vendor.id}:${phase}`;
    let entry = byVendorPhase.get(key);
    if (!entry) {
      entry = {
        vendor,
        phase,
        firstSeenAtMs: atMs,
        requestCount: 0,
        signals: new Set(),
        hosts: new Set(),
        cookies: new Set(),
        storageKeys: new Set(),
      };
      byVendorPhase.set(key, entry);
    }
    entry.signals.add(signal);
    // Earliest wins: "when did this first fire" is what a pre-consent finding
    // reports, and a later occurrence must not overwrite it.
    entry.firstSeenAtMs = Math.min(entry.firstSeenAtMs, atMs);
    return entry;
  }

  /* ── Requests ─────────────────────────────────────────────────────────── */
  for (const request of input.requests) {
    // First-party requests are not tracker detections. A site calling its own
    // API is not a third party, whatever the path looks like.
    if (!request.isThirdParty) continue;

    let matched = false;

    for (const entry of compiled) {
      const byDomain = matchesHost(request.host, entry.vendor.domainPatterns, entry.domain);
      const byScript =
        entry.script.length > 0 && matchesAny(request.url, entry.script);
      const byPath = entry.path.length > 0 && matchesAny(request.url, entry.path);

      if (!byDomain && !byScript && !byPath) continue;
      matched = true;

      const accumulator = accumulate(
        entry.vendor,
        request.consentPhase,
        byDomain ? "domain" : byScript ? "script" : "path",
        request.timestampMs,
      );
      accumulator.requestCount += 1;
      accumulator.hosts.add(request.host);

      // A request can corroborate twice on its own — domain AND a script path
      // both matching is two independent signals about the same row.
      if (byDomain && byScript) accumulator.signals.add("script");
      if (byDomain && byPath) accumulator.signals.add("path");
    }

    if (!matched && request.host) {
      const key = `${request.registrableDomain}:${request.consentPhase}`;
      const existing = unknownByPhase.get(key);
      if (existing) {
        existing.requestCount += 1;
        existing.firstSeenAtMs = Math.min(existing.firstSeenAtMs, request.timestampMs);
        existing.hosts.add(request.host);
      } else {
        unknownByPhase.set(key, {
          phase: request.consentPhase,
          domain: request.registrableDomain,
          firstSeenAtMs: request.timestampMs,
          requestCount: 1,
          hosts: new Set([request.host]),
        });
      }
    }
  }

  /* ── Cookies ──────────────────────────────────────────────────────────── */
  for (const cookie of input.cookies) {
    for (const entry of compiled) {
      if (entry.cookie.length === 0) continue;
      if (!matchesAny(cookie.name, entry.cookie)) continue;

      // Cookies carry no timestamp — they are snapshots (§4.5). 0 means "seen
      // in this phase", and the request timestamp is what a finding quotes.
      const accumulator = accumulate(entry.vendor, cookie.consentPhase, "cookie", 0);
      accumulator.cookies.add(cookie.name);
    }
  }

  /* ── Storage ──────────────────────────────────────────────────────────── */
  for (const item of input.storage) {
    for (const entry of compiled) {
      if (entry.storage.length === 0) continue;
      if (!matchesAny(item.key, entry.storage)) continue;

      const accumulator = accumulate(entry.vendor, item.consentPhase, "storage", 0);
      accumulator.storageKeys.add(item.key);
    }
  }

  /* ── Emit ─────────────────────────────────────────────────────────────── */
  const detections: Detection[] = [];

  for (const entry of byVendorPhase.values()) {
    const signals = [...entry.signals];
    detections.push({
      vendorId: entry.vendor.id,
      unknownDomain: null,
      consentPhase: entry.phase,
      firstSeenAtMs: entry.firstSeenAtMs,
      requestCount: entry.requestCount,
      matchedVia: signals.join("+"),
      confidence: confidenceFor(entry.vendor, entry.signals),
      // THE GATE. Two independent signal types, not two occurrences of one.
      corroborated: entry.signals.size >= 2,
      evidenceSummary: {
        hosts: [...entry.hosts],
        cookies: [...entry.cookies],
        storageKeys: [...entry.storageKeys],
        signals,
      },
    });
  }

  for (const unknown of unknownByPhase.values()) {
    detections.push({
      vendorId: null,
      unknownDomain: unknown.domain,
      consentPhase: unknown.phase,
      firstSeenAtMs: unknown.firstSeenAtMs,
      requestCount: unknown.requestCount,
      matchedVia: "unknown-third-party",
      // Low and never corroborated: we know a third party was contacted, and
      // nothing more. It can never support a Critical finding.
      confidence: 0.3,
      corroborated: false,
      evidenceSummary: {
        hosts: [...unknown.hosts],
        cookies: [],
        storageKeys: [],
        signals: ["domain"],
      },
    });
  }

  return detections;
}
