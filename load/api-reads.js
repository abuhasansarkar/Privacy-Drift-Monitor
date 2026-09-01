import http from "k6/http";
import { check } from "k6";

/**
 * AUTHENTICATED READS — PLAN.md §10.12 ("API reads p95 < 300 ms, p99 < 800 ms",
 * "app list pages TTFB p95 < 400 ms"), Phase 7 task 7.2.
 *
 * ⚠️ IT NEEDS A REAL SESSION COOKIE, and there is no way around that: every
 * page here resolves tenant context, and a load test that bypassed auth would
 * be measuring a code path no user takes. Export the cookie from a signed-in
 * browser, or from `e2e/.auth/user.json` after `npm run e2e`.
 *
 *     E2E_SESSION_COOKIE="__session=..." k6 run load/api-reads.js
 *
 * ⚠️ 50 VIRTUAL USERS SHARE ONE SESSION, which is not what fifty real users
 * look like — they would each have their own Clerk session and their own
 * per-request cache. This measures the DATABASE and the render, which is where
 * the budgets bite; it under-measures auth.
 */
const BASE = __ENV.BASE_URL || "http://localhost:3000";
const COOKIE = __ENV.E2E_SESSION_COOKIE;

export const options = {
  stages: [
    { duration: "30s", target: 25 },
    { duration: "60s", target: 50 },
    { duration: "30s", target: 0 },
  ],
  thresholds: {
    "http_req_duration{surface:list}": ["p(95)<400"],
    "http_req_duration{surface:api}": ["p(95)<300", "p(99)<800"],
    http_req_failed: ["rate<0.01"],
  },
};

export function setup() {
  if (!COOKIE) {
    throw new Error(
      "E2E_SESSION_COOKIE is required — see the note at the top of this file",
    );
  }
}

export default function () {
  const params = { headers: { Cookie: COOKIE } };

  for (const path of ["/app", "/app/websites", "/app/issues", "/app/drift", "/app/reports"]) {
    const response = http.get(`${BASE}${path}`, {
      ...params,
      tags: { surface: "list" },
    });
    check(response, {
      "200": (r) => r.status === 200,
      /*
       * ⚠️ A SERVER COMPONENT THAT THROWS STILL RETURNS 200 with the error UI
       * inside it. Under load that is exactly how a connection-pool exhaustion
       * presents — every request "succeeds" and every page is an error.
       */
      "not the error boundary": (r) => !r.body.includes("couldn"),
    });
  }

  check(http.get(`${BASE}/api/health/ready`, { tags: { surface: "api" } }), {
    "ready": (r) => r.status === 200,
  });
}
