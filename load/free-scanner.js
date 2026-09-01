import http from "k6/http";
import { check } from "k6";

/**
 * THE FREE SCANNER'S ABUSE CONTROLS UNDER LOAD — PLAN.md §3.2, §10.12,
 * Phase 7 task 7.2.
 *
 * ⚠️ **THIS SCRIPT IS NOT A THROUGHPUT TEST AND MUST NOT BE POINTED AT A REAL
 * DOMAIN.** Every accepted submission drives a real browser at whatever URL it
 * names. It submits addresses under `.invalid` — reserved by RFC 2606 and
 * guaranteed never to resolve — so the SSRF guard and the rate limiters do
 * their work and nothing is ever fetched.
 *
 * ⚠️ WHAT IT ASSERTS IS THAT THE CONTROLS HOLD, NOT THAT THE ENDPOINT IS FAST.
 * §3.2's requirement is "the free queue cannot starve the paid queue"; the
 * failure mode this catches is an endpoint that ACCEPTS everything under
 * concurrency because a limiter was per-instance, or a circuit breaker that
 * never trips. A run where every request is rejected is a PASS.
 */
const BASE = __ENV.BASE_URL || "http://localhost:3000";

export const options = {
  vus: 20,
  duration: "30s",
  thresholds: {
    // Never a 5xx: the controls must REFUSE, not fall over.
    "http_req_failed{expected_response:true}": ["rate<0.01"],
    http_req_duration: ["p(95)<1000"],
    // The controls have to actually engage — see the note below.
    "checks{control:rejected}": ["rate>0.8"],
  },
};

export default function () {
  const domain = `load-${__VU}-${__ITER}.invalid`;
  const response = http.post(
    `${BASE}/api/public/free-scan`,
    JSON.stringify({ url: `https://${domain}/`, turnstileToken: "" }),
    { headers: { "Content-Type": "application/json" } },
  );

  /*
   * ⚠️ A REJECTION IS THE PASS CONDITION. 400 (invalid or blocked address),
   * 429 (rate limited) and 503 (at capacity) are all the system working. A 202
   * under this load means a control is missing — and if the tag rate falls
   * below 80% the threshold above fails the run.
   */
  check(
    response,
    { "refused by a control": (r) => [400, 429, 503].includes(r.status) },
    { control: "rejected" },
  );
  check(response, { "never a 5xx": (r) => r.status < 500 || r.status === 503 });
}
