import type { NextRequest } from "next/server";
import { z } from "zod";
import { toAppError } from "@pdm/shared/errors";
import { logger } from "@pdm/shared/logger";
import {
  generateClientMessage,
  generateDriftSummary,
  generateIssueOutput,
} from "@/server/actions/ai";

/**
 * `POST /api/ai/generate` — PLAN.md §3.9's page inventory, Phase 5 task 5.6.
 *
 * ⚠️ THIS ROUTE WAS DELIBERATELY DEFERRED IN PHASE 5, and the reason is worth
 * keeping: "a second unauthenticated-by-default entry point to a billable
 * operation is not worth adding before something consumes it." It lands now
 * with the guard that makes it safe — it does not reimplement anything. Every
 * branch below calls the SAME Server Action the UI calls, so authorization,
 * website scoping, entitlement consumption, grounding validation and the audit
 * trail are the action's, once.
 *
 * ⚠️ A ROUTE THAT DUPLICATED THE ACTION'S LOGIC WOULD BE THE DEFECT. AGENTS.md
 * records the branding bug that came from exactly this shape: a second call
 * site that asked the resolver a slightly different question and gave away a
 * paid feature. There is no `callAI` here, and there must not be.
 *
 * ⚠️ EVERY ACTION RE-CHECKS `requirePermission("ai:generate")` ITSELF, so this
 * handler needs no gate of its own — and adding one would create a second
 * place for the two to drift apart.
 */

/*
 * ⚠️ THE SHAPES MIRROR THE ACTIONS' OWN SCHEMAS EXACTLY, including the enum
 * that constrains `tone`. §8.8 ("prompt injection via user input"): the tone is
 * the only thing a user chooses about the client-message prompt, so it is the
 * only thing that must not be a string they typed. An API that accepted free
 * text here and let the action reject it would still be the wider door.
 */
const schema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("issue"),
    issueId: z.string().uuid(),
    feature: z.enum(["EXPLAIN_ISSUE", "RECOMMEND_FIX"]),
  }),
  z.object({
    kind: z.literal("drift"),
    websiteId: z.string().uuid(),
    days: z.number().int().min(1).max(90).default(7),
  }),
  z.object({
    kind: z.literal("client-message"),
    websiteId: z.string().uuid(),
    issueIds: z.array(z.string().uuid()).min(1).max(5),
    tone: z.enum(["reassuring", "factual", "urgent"]),
    fixInProgress: z.boolean(),
  }),
]);

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return Response.json({ error: "INVALID_REQUEST" }, { status: 400 });
    }

    const input = parsed.data;
    const result =
      input.kind === "issue"
        ? await generateIssueOutput({ issueId: input.issueId, feature: input.feature })
        : input.kind === "drift"
          ? await generateDriftSummary({ websiteId: input.websiteId, days: input.days })
          : await generateClientMessage({
              websiteId: input.websiteId,
              issueIds: input.issueIds,
              tone: input.tone,
              fixInProgress: input.fixInProgress,
            });

    if (!result.ok) {
      /*
       * ⚠️ 422, NOT 500. A rejected or blocked generation is a RESULT (P3: AI
       * is additive, never load-bearing) — the deterministic finding is intact
       * and the caller should render the unavailable state, not retry.
       */
      return Response.json({ error: result.code, message: result.message }, { status: 422 });
    }

    return Response.json(result.data);
  } catch (error) {
    const appError = toAppError(error);
    logger.warn(
      { component: "ai-api", code: appError.code, reason: appError.reason },
      "ai generation request failed",
    );
    return Response.json(
      { error: appError.code, message: appError.expose ? appError.message : undefined },
      { status: appError.httpStatus },
    );
  }
}
