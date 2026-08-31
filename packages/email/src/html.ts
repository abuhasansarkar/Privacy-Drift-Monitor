/**
 * EMAIL MARKUP PRIMITIVES — PLAN.md Part IX §9.5.
 *
 * ⚠️ DELIBERATE DEVIATION FROM §12.1's "React Email templates". Email HTML is
 * table-based markup with inline styles that no email client renders the way a
 * browser does; a React component tree buys nothing here and costs the worker a
 * `react-dom/server` dependency and a JSX build step in a Node process that
 * otherwise has neither. `packages/reports` DOES use React, because report
 * templates genuinely reuse the app's tokens and render in Chromium.
 *
 * ⚠️ EVERY INTERPOLATION IS ESCAPED BY DEFAULT. An agency's company name, a
 * client's contact name and a website URL all reach these templates from user
 * input, and an email is forwarded to people outside the tenant. Raw insertion
 * requires the explicit `raw()` marker below, which is greppable in review.
 */

const ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ENTITIES[char] ?? char);
}

/** Marks a string as already-safe markup. The only way past the escaper. */
export class SafeHtml {
  constructor(readonly value: string) {}
  toString(): string {
    return this.value;
  }
}

export function raw(value: string): SafeHtml {
  return new SafeHtml(value);
}

export type Interpolatable = string | number | SafeHtml | null | undefined | SafeHtml[];

function stringify(value: Interpolatable): string {
  if (value === null || value === undefined) return "";
  if (value instanceof SafeHtml) return value.value;
  if (Array.isArray(value)) return value.map((item) => item.value).join("");
  return escapeHtml(String(value));
}

/** Tagged template that escapes every interpolation. */
export function html(
  strings: TemplateStringsArray,
  ...values: Interpolatable[]
): SafeHtml {
  let out = strings[0] ?? "";
  for (let i = 0; i < values.length; i += 1) {
    out += stringify(values[i]) + (strings[i + 1] ?? "");
  }
  return new SafeHtml(out);
}

/**
 * A very small HTML → text reduction for the plain-text alternative.
 *
 * ⚠️ THE TEXT PART IS NOT OPTIONAL. A message with no `text/plain` alternative
 * scores badly with spam filters, and a transactional alert landing in spam is
 * a monitoring product that silently stopped monitoring.
 */
export function toPlainText(markup: string): string {
  return markup
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<head[\s\S]*?<\/head>/gi, "")
    .replace(/<\/(p|div|tr|h1|h2|h3|li)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .split("\n")
    .map((line) => line.trim())
    .filter((line, index, lines) => line !== "" || lines[index - 1] !== "")
    .join("\n")
    .trim();
}
