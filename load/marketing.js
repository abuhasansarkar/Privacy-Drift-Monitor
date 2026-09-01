import http from "k6/http";
import { check, group } from "k6";

/**
 * MARKETING UNDER LOAD — PLAN.md §10.12, Phase 7 task 7.2.
 *
 * ⚠️ THESE PAGES ARE STATICALLY PRERENDERED, so this is really a test of the
 * cache and the edge, not of the app. That makes it the cheapest useful signal
 * available: if a prerendered page's TTFB degrades under load, something has
 * silently made it dynamic — which is exactly the regression `/pricing` is one
 * careless `headers()` call away from, and nothing else would catch it.
 */
const BASE = __ENV.BASE_URL || "http://localhost:3000";

export const options = {
  stages: [
    { duration: "20s", target: 20 },
    { duration: "40s", target: 50 },
    { duration: "20s", target: 0 },
  ],
  thresholds: {
    // A prerendered page has no excuse for a slow TTFB. This is deliberately
    // far tighter than §10.12's 400 ms list-page budget.
    "http_req_duration{page:static}": ["p(95)<200"],
    http_req_failed: ["rate<0.01"],
  },
};

export default function () {
  group("static marketing", () => {
    for (const path of ["/", "/pricing", "/free-scanner", "/resources", "/blog"]) {
      const response = http.get(`${BASE}${path}`, { tags: { page: "static" } });
      check(response, {
        "200": (r) => r.status === 200,
        // If this ever fails, a nonce has been applied to a static page and it
        // is no longer prerendered. See the two-policy note in `src/proxy.ts`.
        "no nonce (still static)": (r) =>
          !(r.headers["Content-Security-Policy"] || "").includes("nonce-"),
      });
    }
  });
}
