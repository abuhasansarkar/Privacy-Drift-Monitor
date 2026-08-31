/**
 * REDACTION — PLAN.md Part VIII §8.4 ("Redaction before the model sees
 * anything") and §8.8 (prompt injection), Phase 5 task 5.2.
 *
 * ⚠️ THIS FILE IS THE PROMPT-INJECTION DEFENSE, not a privacy nicety.
 *
 * §8.8: "The model never sees page content. Context is built from typed
 * database fields, and every string that could originate from a scanned site
 * (domain names, cookie names) is escaped and length-capped. This is the
 * strongest available defense: injection requires reaching the model, and
 * scanned text does not."
 *
 * A scanned site is hostile input by definition — anyone can put
 * "IGNORE PREVIOUS INSTRUCTIONS" in a cookie name or a query string. The
 * functions below are what stand between that and the prompt.
 *
 * The second job is customer confidentiality: full URLs are reduced to host +
 * path shape (query strings stripped ENTIRELY, because that is where session
 * tokens, email addresses and click ids live), cookie values are never
 * included, and no agency name, client name or user email is ever sent.
 */

/**
 * Control characters, which would let scanned text break out of its JSON string
 * or masquerade as prompt structure. Newlines included: a multi-line cookie
 * name is how a forged "System:" line gets into the prompt.
 */
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028\u2029\ufeff]/g;
/** Sequences that read as prompt scaffolding to a model. */
const SCAFFOLD = /(\{\{|\}\}|```|<\|[^|]*\|>)/g;

/**
 * Neutralises one string that may have come from a scanned site.
 *
 * Length-capping is part of the defense, not cosmetic: an injection payload
 * needs room, and a 120-character budget for a cookie name leaves none. The
 * ellipsis is deliberate — a truncated value must LOOK truncated, or a reader
 * takes a cut-off domain for the real one.
 */
export function sanitize(value: string, maxLength = 200): string {
  const cleaned = value
    .replace(CONTROL, " ")
    .replace(SCAFFOLD, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > maxLength
    ? `${cleaned.slice(0, maxLength - 1)}…`
    : cleaned;
}

/**
 * Reduces a URL to host + path shape.
 *
 * ⚠️ THE QUERY STRING IS DROPPED WHOLE, never redacted key by key. A denylist
 * of sensitive parameter names is a list that is always one vendor behind;
 * dropping everything after `?` cannot be behind. The model does not need it —
 * "which endpoint was called" is answered by host + path.
 *
 * Path segments that look like identifiers are collapsed to `:id` so the model
 * generalises across pages instead of anchoring on one URL, and so an id that
 * happens to be an email or an order number never leaves the database.
 */
export function redactUrl(raw: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    // Not a URL — treat it as untrusted text and cap it hard.
    return sanitize(raw, 120);
  }

  const shape = parsed.pathname
    .split("/")
    .map((segment) => {
      if (segment === "") return segment;
      // Long hex/uuid-ish or purely numeric segments are identifiers.
      if (/^[0-9]+$/.test(segment)) return ":id";
      if (/^[0-9a-f-]{16,}$/i.test(segment)) return ":id";
      if (segment.includes("@")) return ":id";
      return sanitize(segment, 48);
    })
    .join("/");

  return sanitize(`${parsed.host}${shape}`, 160);
}

/**
 * A one-line evidence summary in the shape §8.4's example uses:
 *   'GET connect.facebook.net/en_US/fbevents.js → 200 (initiator: gtm.js)'
 *
 * Built here rather than in the caller so every summary is redacted by
 * construction — a builder that formatted its own string would be one review
 * away from interpolating a raw URL.
 */
export function requestSummary(input: {
  method: string;
  url: string;
  status?: number | null;
  initiator?: string | null;
}): string {
  const parts = [sanitize(input.method, 8).toUpperCase(), redactUrl(input.url)];
  if (typeof input.status === "number") parts.push(`→ ${input.status}`);
  const line = parts.join(" ");
  return input.initiator
    ? `${line} (initiator: ${redactUrl(input.initiator)})`
    : line;
}

/**
 * A cookie summary. ⚠️ THE VALUE IS NEVER INCLUDED — §8.4 is explicit, and a
 * cookie value is the single most likely place for a session token or a hashed
 * email to be sitting.
 */
export function cookieSummary(input: {
  name: string;
  domain: string;
  maxAgeDays?: number | null;
  httpOnly?: boolean | null;
  thirdParty?: boolean | null;
}): string {
  const parts = [
    `${sanitize(input.name, 120)} set on ${sanitize(input.domain, 120)}`,
  ];
  if (typeof input.maxAgeDays === "number") {
    parts.push(`${input.maxAgeDays} days`);
  }
  if (input.httpOnly === false) parts.push("not HttpOnly");
  if (input.thirdParty) parts.push("third-party");
  return parts.join(", ");
}

export function storageSummary(input: {
  storageType: string;
  key: string;
  origin: string;
}): string {
  return (
    `${sanitize(input.storageType, 24)} key ${sanitize(input.key, 120)} ` +
    `written on ${sanitize(input.origin, 120)}`
  );
}
