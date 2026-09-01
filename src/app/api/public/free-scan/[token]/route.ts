import { unsafeGlobalClient } from "@pdm/database";

/**
 * `GET /api/public/free-scan/[token]` — the result poller (§3.2, task 6.5).
 *
 * ⚠️ THE TOKEN IS THE ONLY CREDENTIAL, AND IT IS 32 BYTES OF `randomBytes`.
 * §3.2: "public but unguessable". There is no session here and there must not
 * be — the whole point is a link an anonymous submitter can return to.
 *
 * ⚠️ IT RETURNS THE STORED SUMMARY VERBATIM AND NOTHING ELSE. `resultSummary`
 * is `FreeScanSummary`, a shape with deliberately no field for a request URL, a
 * cookie value or a rule id (feature doc 18). Spreading the row here — which is
 * the obvious one-line version of this handler — would leak `ipHash`, the
 * internal id and the raw error text.
 *
 * ⚠️ AN EXPIRED RESULT IS A 404, NOT A 410. The row may still exist for a few
 * hours between expiry and the nightly purge; treating that window as "gone" is
 * both accurate to the promise ("kept for 7 days") and one fewer state for the
 * page to render.
 */

const db = unsafeGlobalClient(
  // Justification (required in review): `FreeScan` is pre-tenant (§5.9). No
  // agency exists for an anonymous scan and the row is fetched by a 32-byte
  // random token, never by anything a caller can enumerate.
  "the free scanner is pre-tenant; the row is addressed by an unguessable token",
);

export async function GET(
  _request: Request,
  context: RouteContext<"/api/public/free-scan/[token]">,
): Promise<Response> {
  // `params` is a Promise in Next 16 (AGENTS.md).
  const { token } = await context.params;

  const scan = await db.freeScan.findUnique({
    where: { token },
    select: {
      url: true,
      status: true,
      healthScore: true,
      resultSummary: true,
      errorCode: true,
      expiresAt: true,
    },
  });

  if (!scan || scan.expiresAt.getTime() <= Date.now()) {
    return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  return Response.json({
    url: scan.url,
    status: scan.status,
    healthScore: scan.healthScore,
    summary: scan.resultSummary,
    errorCode: scan.errorCode,
    expiresAt: scan.expiresAt.toISOString(),
  });
}
