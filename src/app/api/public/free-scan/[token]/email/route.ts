import type { NextRequest } from "next/server";
import { z } from "zod";
import { unsafeGlobalClient } from "@pdm/database";
import { domainHash, track } from "@pdm/shared/analytics";
import { logger } from "@pdm/shared/logger";

/**
 * `POST /api/public/free-scan/[token]/email` — Lead capture email submission.
 *
 * Saves the recipient's email address to the `FreeScan` record so they can
 * receive their report and continue to full onboarding.
 */

const db = unsafeGlobalClient(
  "free scanner lead email submission; pre-tenant record updated by token",
);

const schema = z.object({
  email: z.string().email().max(200),
});

export async function POST(
  request: NextRequest,
  context: RouteContext<"/api/public/free-scan/[token]/email">,
): Promise<Response> {
  const { token } = await context.params;

  const body: unknown = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "INVALID_EMAIL" }, { status: 400 });
  }

  const scan = await db.freeScan.findUnique({
    where: { token },
    select: { id: true, url: true, expiresAt: true },
  });

  if (!scan || scan.expiresAt.getTime() <= Date.now()) {
    return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  try {
    await db.freeScan.update({
      where: { token },
      data: { email: parsed.data.email },
    });

    void track("free_scan_email_submitted", {
      freeScanId: scan.id,
      domain_hash: domainHash(scan.url),
    });

    return Response.json({ ok: true });
  } catch (error) {
    logger.error(
      { component: "free-scan-email", err: error },
      "failed to save free scan email",
    );
    return Response.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
