import type { NextRequest } from "next/server";
import { contactSchema, submitContact } from "@/server/services/contact";

/**
 * `POST /api/public/contact` — PLAN.md §3.2, Phase 6.
 *
 * ⚠️ A ROUTE, NOT A SERVER ACTION, because `/contact` is statically
 * prerendered. A Server Action on a marketing page opts the page out of static
 * rendering, and this is a page whose whole job is to be served from a cache.
 *
 * ⚠️ THE HONEYPOT PATH RETURNS 200. `submitContact` succeeds silently on a
 * filled honeypot; telling a bot it was caught is telling whoever wrote it what
 * to change.
 */
function clientIp(request: NextRequest): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? null;
  return request.headers.get("x-real-ip");
}

export async function POST(request: NextRequest): Promise<Response> {
  const parsed = contactSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "INVALID" }, { status: 400 });
  }

  const outcome = await submitContact(parsed.data, clientIp(request));
  if (outcome.ok) return Response.json({ ok: true });

  return Response.json(
    { error: outcome.code },
    { status: outcome.code === "RATE_LIMITED" ? 429 : 400 },
  );
}
