import type { NextRequest } from "next/server";
import { z } from "zod";
import { toAppError } from "@pdm/shared/errors";
import { submitAiFeedback } from "@/server/actions/ai";

/**
 * `POST /api/ai/feedback` — PLAN.md §3.9, §8.8, Phase 5 task 5.6.
 *
 * ⚠️ FEEDBACK IS THE INPUT TO PROMPT REVISION (§8.8's per-prompt-version
 * acceptance rate), which is why it is worth an endpoint at all. Like
 * `/api/ai/generate` it delegates to the Server Action rather than writing the
 * row itself — the action owns the tenant check that stops one agency rating
 * another's output.
 */
const schema = z.object({
  requestId: z.string().uuid(),
  score: z.union([z.literal(-1), z.literal(0), z.literal(1)]),
});

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return Response.json({ error: "INVALID_REQUEST" }, { status: 400 });
    }

    const result = await submitAiFeedback(parsed.data);
    if (!result.ok) {
      return Response.json({ error: result.code }, { status: 422 });
    }
    return new Response(null, { status: 204 });
  } catch (error) {
    const appError = toAppError(error);
    return Response.json({ error: appError.code }, { status: appError.httpStatus });
  }
}
