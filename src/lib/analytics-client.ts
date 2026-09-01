/**
 * BROWSER-SIDE ANALYTICS — PLAN.md §9.6, Phase 6 task 6.8.
 *
 * ⚠️ A `fetch` WITH `keepalive`, NOT AN SDK. §9.6 wants the vendor swappable,
 * and shipping a vendor SDK to the browser makes it un-swappable in the one
 * place that matters commercially — a marketing page's bundle size. `keepalive`
 * lets the request survive the navigation that a CTA click causes, which is
 * exactly the event we most want to record.
 *
 * ⚠️ IT NEVER AWAITS AND NEVER THROWS. A pricing page that fails because a
 * telemetry call did is a page that costs a sale.
 */
export function trackClient(
  event: string,
  properties: Record<string, string | number | boolean | null> = {},
): void {
  void fetch("/api/public/analytics", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ event, properties }),
    keepalive: true,
  }).catch(() => {});
}
