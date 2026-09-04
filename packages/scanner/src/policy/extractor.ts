/**
 * CLEAN TEXT EXTRACTOR — Module 23 (Phase 14).
 *
 * Converts raw HTML privacy policy pages into clean, readable text/markdown
 * stripped of navigation menus, headers, footers, scripts, and tracking markup.
 */

const TAGS_TO_REMOVE = [
  /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
  /<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi,
  /<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi,
  /<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi,
  /<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi,
  /<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi,
  /<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi,
  /<form\b[^<]*(?:(?!<\/form>)<[^<]*)*<\/form>/gi,
  /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
];

/**
 * Decodes common HTML entities.
 */
export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&mdash;/gi, "—")
    .replace(/&ndash;/gi, "–")
    .replace(/&#(\d+);/g, (_match, dec) => String.fromCharCode(Number(dec)));
}

/**
 * Extracts clean, readable text from raw HTML content.
 */
export function extractCleanText(
  html: string,
  options: { maxCharacters?: number } = {},
): string {
  const maxCharacters = options.maxCharacters ?? 15000;

  // 1. Remove non-content tags
  let cleaned = html;
  for (const pattern of TAGS_TO_REMOVE) {
    cleaned = cleaned.replace(pattern, " ");
  }

  // 2. Convert block boundaries to newlines and headings
  cleaned = cleaned
    .replace(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi, "\n\n### $1\n\n")
    .replace(/<\/(?:p|div|section|article|tr|blockquote)>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ");

  // 3. Strip all remaining HTML tags
  cleaned = cleaned.replace(/<[^>]+>/g, " ");

  // 4. Decode entities
  cleaned = decodeHtmlEntities(cleaned);

  // 5. Normalize whitespace: collapse multiple horizontal spaces, and cap multiple newlines
  cleaned = cleaned
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+\n/g, "\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // 6. Truncate to maximum characters safely at word boundary
  if (cleaned.length > maxCharacters) {
    const truncated = cleaned.slice(0, maxCharacters);
    const lastSpace = truncated.lastIndexOf(" ");
    return (lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated) + "\n\n[Content truncated for analysis]";
  }

  return cleaned;
}
