/**
 * JSON-LD payload rendered as a `<script>` tag. Only called with data built
 * from local constants that mirror VISIBLE page content — structured data that
 * does not match what a visitor can read gets rich results suppressed.
 *
 * Lives in a `.tsx` file because it renders JSX; the builders stay in
 * `src/lib/seo.ts` as pure data.
 */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      // Built from constants, never from user input.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
