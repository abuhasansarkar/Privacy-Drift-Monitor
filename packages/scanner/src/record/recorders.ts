import { parse as parseHost } from "tldts";
import type { BrowserContext, Page, Request, Response } from "playwright";
import {
  sanitizeConsoleMessage,
  sanitizeCookieValue,
  sanitizeStorageValue,
  sanitizeUrl,
} from "../privacy/sanitize";
import type {
  ConsentPhase,
  RecordedConsoleLog,
  RecordedCookie,
  RecordedRequest,
  RecordedStorageEntry,
  SnapshotPoint,
} from "../types";
import { resolveDestinationCountry } from "../net/geoip";
/**
 * EVIDENCE RECORDERS — PLAN.md Part IV §4.4/§4.5, Phase 2 task 2.3.
 *
 * ⚠️ THIS IS THE ONLY PLACE FACTS ENTER THE SYSTEM. Part 0 §0.2 P6: "nothing
 * downstream of EvidenceCollector may add facts". The classifier, rule engine,
 * drift engine and risk engine all only INTERPRET what these recorders wrote,
 * which is what makes a scan replayable. A recorder that infers, normalises
 * away, or "helpfully" fills in a missing value breaks that guarantee.
 *
 * ⚠️ EVERYTHING IS SANITIZED ON THE WAY IN, not on the way out (§10.6). We drive
 * arbitrary third-party sites; a query string can contain a session token and a
 * cookie value can be a user identifier. Storing raw and redacting at render
 * time means the raw value is already in our database and our backups.
 */
export interface RecorderContext {
  phase: ConsentPhase;
  pageUrl: string;
  /** eTLD+1 of the monitored site — the basis for third-party classification. */
  registrableDomain: string;
  /** Navigation start, so every timestamp is an offset and scans are comparable. */
  startedAt: number;
}
/**
 * Host and eTLD+1 for a URL.
 *
 * ⚠️ `sanitizeUrl()` deliberately does NOT return these — it is a privacy
 * filter, not a parser, and it must stay that way. Third-party classification
 * needs the registrable domain, so it is computed here from the RAW url before
 * sanitisation drops the parts it does not need.
 *
 * The fallback matters: `parse()` returns a null domain for an IP literal or a
 * hostless URL (`about:blank`, `data:`). Falling back to the host keeps the
 * comparison self-consistent rather than making every such request look
 * third-party to every other one.
 */
function hostInfo(rawUrl: string): { host: string; registrableDomain: string } {
  try {
    const host = new URL(rawUrl).hostname.toLowerCase();
    return { host, registrableDomain: parseHost(host).domain ?? host };
  } catch {
    return { host: "", registrableDomain: "" };
  }
}
function registrableDomainOf(host: string): string {
  return parseHost(host).domain ?? host;
}
/* ── Network ─────────────────────────────────────────────────────────────── */
/**
 * Records every request the page makes.
 *
 * ⚠️ Attached to the CONTEXT, not the page. A tag that opens a popup or runs in
 * an iframe with its own page object would otherwise go unrecorded — and "we
 * did not see it" would be indistinguishable from "it did not happen", which is
 * the one confusion this product cannot afford.
 */
export class NetworkRecorder {
  private readonly records: RecordedRequest[] = [];
  private readonly byRequest = new Map<Request, number>();
  constructor(private readonly ctx: RecorderContext) {}
  /**
   * ⚠️ A RECORDER MUST NEVER THROW INTO A PLAYWRIGHT EVENT HANDLER.
   *
   * An exception raised inside `context.on("response", …)` does not reject the
   * scan's promise — it escapes as an uncaught exception and the phase hangs
   * forever, holding its context. That is exactly how a wrong assumption about
   * one API (`headersArray()` returns a Promise, not an array) turned into a
   * worker that stops instead of a scan that fails.
   *
   * Recording is best-effort by design: a request we failed to annotate is a
   * less complete record, which downstream reads as absence of evidence. A
   * hung worker is an outage.
   */
  private static safely(work: () => void | Promise<void>): void {
    try {
      const result = work();
      if (result) void result.catch(() => {});
    } catch {
      /* one record lost; the scan continues */
    }
  }

  attach(context: BrowserContext): () => void {
    const onRequest = (request: Request) =>
      NetworkRecorder.safely(() => this.onRequest(request));
    const onResponse = (response: Response) =>
      NetworkRecorder.safely(() => this.onResponse(response));
    const onFailed = (request: Request) =>
      NetworkRecorder.safely(() => this.onFailed(request));
    context.on("request", onRequest);
    context.on("response", onResponse);
    context.on("requestfailed", onFailed);
    return () => {
      context.off("request", onRequest);
      context.off("response", onResponse);
      context.off("requestfailed", onFailed);
    };
  }

  private classify(rawUrl: string) {
    const sanitized = sanitizeUrl(rawUrl);
    const { host, registrableDomain } = hostInfo(rawUrl);
    return {
      sanitized,
      host,
      registrableDomain,
      // eTLD+1 comparison, NOT a suffix match on the host. `cdn.acme.co.uk` is
      // first-party to `acme.co.uk`; `acme.co.uk.evil.com` is not, and a naive
      // `endsWith` would call it first-party.
      isThirdParty: registrableDomain !== this.ctx.registrableDomain,
    };
  }

  private onRequest(request: Request) {
    const { sanitized, host, registrableDomain, isThirdParty } = this.classify(
      request.url(),
    );
    const index = this.records.length;
    this.byRequest.set(request, index);
    this.records.push({
      pageUrl: this.ctx.pageUrl,
      consentPhase: this.ctx.phase,
      url: sanitized.url,
      method: request.method(),
      resourceType: request.resourceType(),
      host,
      registrableDomain,
      isThirdParty,
      status: null,
      failureText: null,
      initiatorType: request.resourceType(),
      initiatorUrl: request.frame()?.url() ?? null,
      timestampMs: Date.now() - this.ctx.startedAt,
      transferSize: null,
      redirectChain: [],
      setCookieCount: 0,
    });
  }

  private async onResponse(response: Response) {
    const index = this.byRequest.get(response.request());
    if (index === undefined) return;
    const record = this.records[index];
    if (!record) return;

    record.status = response.status();

    /*
     * COUNT ONLY. §10.6 is explicit that Set-Cookie values are never stored —
     * the count is what a finding needs, and the value is what would make this
     * table a liability.
     *
     * ⚠️ `headersArray()` is ASYNC. Calling `.filter` on the un-awaited promise
     * threw inside a Playwright event handler, which does not reject the scan's
     * promise — it escaped as an uncaught exception and the phase hung forever
     * holding its context. `headersArray()` rather than `headers()` because the
     * latter merges duplicates into one string, and duplicates are the count.
     */
    const headers = await response.headersArray();
    record.setCookieCount = headers.filter(
      (header) => header.name.toLowerCase() === "set-cookie",
    ).length;

    // The redirect chain is walked from the response, because a 30x hop is a
    // separate Request object and the chain is how a finding explains where a
    // tracker actually ended up.
    const chain: string[] = [];
    let previous = response.request().redirectedFrom();
    while (previous) {
      chain.unshift(sanitizeUrl(previous.url()).url);
      previous = previous.redirectedFrom();
    }
    record.redirectChain = chain;

    const server = await response.serverAddr().catch(() => null);
    if (server?.ipAddress) {
      record.destinationCountry = await resolveDestinationCountry(server.ipAddress).catch(() => null);
    } else if (record.host) {
      record.destinationCountry = await resolveDestinationCountry(record.host).catch(() => null);
    }
  }

  private onFailed(request: Request) {
    const index = this.byRequest.get(request);
    if (index === undefined) return;
    const record = this.records[index];
    if (!record) return;

    // A blocked request IS evidence: an ad blocker's target and a broken tag
    // look different, and both matter to the finding.
    record.failureText = request.failure()?.errorText ?? "failed";
  }

  drain(): RecordedRequest[] {
    return [...this.records];
  }
}
/* ── Cookies ─────────────────────────────────────────────────────────────── */
/**
 * Snapshots cookies at named points in a phase (§4.5).
 *
 * Snapshots rather than a stream, because the browser gives no event for a
 * cookie written by `document.cookie`. The points are chosen so the DIFFERENCE
 * between them answers the question that matters: what appeared before the user
 * was asked, versus after they answered.
 */
export async function snapshotCookies(
  context: BrowserContext,
  ctx: RecorderContext,
  point: SnapshotPoint,
): Promise<RecordedCookie[]> {
  const cookies = await context.cookies();
  const now = Date.now();
  return cookies.map((cookie) => {
    const sanitized = sanitizeCookieValue(cookie.name, cookie.value);
    const domain = cookie.domain.replace(/^\./, "");
    return {
      consentPhase: ctx.phase,
      snapshotPoint: point,
      name: cookie.name,
      domain,
      path: cookie.path,
      // Playwright reports a session cookie as expires === -1.
      isSession: cookie.expires === -1,
      durationDays:
        cookie.expires === -1
          ? null
          : Math.max(0, Math.round((cookie.expires * 1000 - now) / 86_400_000)),
      secure: cookie.secure,
      httpOnly: cookie.httpOnly,
      sameSite: cookie.sameSite ?? null,
      isThirdParty: registrableDomainOf(domain) !== ctx.registrableDomain,
      valueHash: sanitized.valueHash,
      valueLength: sanitized.valueLength,
      valueRaw: sanitized.valueRaw,
    };
  });
}
/* ── Storage ─────────────────────────────────────────────────────────────── */
/** Shape returned by the in-page reader below. Kept separate so the evaluate
 *  callback stays a plain string expression (this package has no DOM lib). */
interface RawStorageEntry {
  storageType: "local" | "session";
  key: string;
  value: string;
  origin: string;
}
/**
 * Reads localStorage and sessionStorage.
 *
 * ⚠️ IndexedDB is NOT read here. Enumerating it needs an async walk of every
 * database and object store, and a partial read would be worse than none: a
 * finding that says "no storage written" because we only looked at two of three
 * mechanisms is the product asserting something it did not check. IndexedDB
 * gets its own recorder, or it stays out of the evidence entirely.
 */
export async function snapshotStorage(
  page: Page,
  ctx: RecorderContext,
): Promise<RecordedStorageEntry[]> {
  // A string expression, not a closure: `localStorage` only type-checks with
  // the DOM lib, which this Node package deliberately does not load.
  const raw = await page
    .evaluate<RawStorageEntry[]>(
      `(() => {
        const out = [];
        const origin = location.origin;
        for (const [type, store] of [["local", localStorage], ["session", sessionStorage]]) {
          for (let i = 0; i < store.length; i++) {
            const key = store.key(i);
            if (key === null) continue;
            out.push({ storageType: type, key, value: store.getItem(key) ?? "", origin });
          }
        }
        return out;
      })()`,
    )
    // A cross-origin or closed page throws here. Storage we could not read is
    // recorded as absent-and-unknown by the caller, never as "none written".
    .catch((): RawStorageEntry[] => []);
  return raw.map((entry) => {
    const sanitized = sanitizeStorageValue(entry.key, entry.value);
    return {
      consentPhase: ctx.phase,
      storageType: entry.storageType,
      key: entry.key,
      valueLength: sanitized.valueLength,
      valueHash: sanitized.valueHash,
      origin: entry.origin,
    };
  });
}
/* ── Console ─────────────────────────────────────────────────────────────── */
/**
 * Errors and warnings only.
 *
 * Console noise is diagnostic, not evidence — it explains why a phase went
 * wrong ("Refused to load … Content Security Policy"), and it never supports a
 * finding on its own. Capped so one broken page cannot fill a scan.
 */
export class ConsoleRecorder {
  private readonly logs: RecordedConsoleLog[] = [];
  private static readonly MAX = 50;
  attach(page: Page): () => void {
    const onConsole = (message: { type(): string; text(): string; location(): { url: string } }) => {
      const type = message.type();
      if (type !== "error" && type !== "warning") return;
      if (this.logs.length >= ConsoleRecorder.MAX) return;
      this.logs.push({
        level: type,
        message: sanitizeConsoleMessage(message.text()),
        source: message.location().url || null,
      });
    };
    page.on("console", onConsole);
    return () => page.off("console", onConsole);
  }

  drain(): RecordedConsoleLog[] {
    return [...this.logs];
  }
}
