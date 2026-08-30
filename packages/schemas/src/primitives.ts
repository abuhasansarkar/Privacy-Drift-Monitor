import { z } from "zod";

/**
 * SHARED ZOD PRIMITIVES — PLAN.md Part VI (validation).
 *
 * One definition per concept, reused by API input validation, job payload
 * validation and test factories. A rule defined twice is a rule that will
 * disagree with itself.
 *
 * ⚠️ NOTHING here performs an SSRF check. `httpUrl` below validates SHAPE only.
 * Network safety is `assertSafeUrl()` in packages/scanner/src/net/guard.ts, and
 * it must run server-side on every navigation AND every redirect hop (§10.3).
 * Passing this schema is not permission to fetch anything.
 */

export const uuid = z.string().uuid();
export const cuid = z.string().min(1);

export const email = z.string().trim().toLowerCase().email().max(254);

/** Cursor for keyset pagination over evidence and activity feeds. */
export const cursor = z.string().min(1).max(512);

export const pagination = z.object({
  cursor: cursor.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

/**
 * Shape-only URL validation.
 *
 * - http/https only — no javascript:, data:, file:, ftp:
 * - no embedded credentials (`http://user:pass@host`), a classic guard bypass
 * - length-capped to keep pathological inputs out of the database
 */
export const httpUrl = z
  .string()
  .trim()
  .min(4)
  .max(2048)
  .refine((value) => {
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      return false;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    if (parsed.username || parsed.password) return false;
    return true;
  }, "That doesn't look like a valid website address.");

/** A registrable domain (eTLD+1). Computed server-side via the Public Suffix List. */
export const registrableDomain = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(253)
  .regex(/^[a-z0-9.-]+$/, "Invalid domain");

/** IANA timezone. Validated against the runtime's own tz database, not a list. */
export const timezone = z.string().refine((tz) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}, "Unknown timezone");

/** Hex colour for agency branding. Contrast is validated separately at save time (§11.6). */
export const hexColor = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, "Use a 6-digit hex colour, e.g. #2563EB");

export const slug = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and hyphens");

/** Free text that reaches a human. Trimmed and bounded; never unbounded. */
export const shortText = z.string().trim().min(1).max(200);
export const mediumText = z.string().trim().min(1).max(2000);
export const longText = z.string().trim().min(1).max(10_000);

/**
 * A mandatory written reason. Required for ignoring an issue and for deleting a
 * website (§3.10) — the actions most likely to be questioned months later.
 */
export const reason = z.string().trim().min(10).max(500);

export const dateRange = z
  .object({ from: z.coerce.date(), to: z.coerce.date() })
  .refine((r) => r.from <= r.to, "The start date must be before the end date");

/** Money is integer minor units everywhere. Never a float. */
export const minorUnits = z.number().int();

export const currency = z.enum(["USD", "GBP", "EUR"]);
