"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { repositoriesFor } from "@pdm/database/repositories";
import { t } from "@pdm/shared/copy";
import { isWebsiteInScope } from "@pdm/shared/permissions";
import { NotFoundError, ValidationError } from "@pdm/shared/errors";
import { childLogger } from "@pdm/shared/logger";
import { requirePermission, type AgencyContext } from "@/server/auth/context";
import {
  buildClientMessageContextFor,
  buildDriftContextFor,
  buildIssueContextFor,
} from "@/server/queries/ai";
import { callAI } from "@/server/services/ai";
import { actionFromError, actionOk, type ActionResult } from "./result";

/**
 * AI ACTIONS — PLAN.md Part VIII §8.5, Phase 5 task 5.6.
 *
 * ⚠️ AUTHORIZATION IS RE-CHECKED INSIDE EVERY ACTION. Next 16's proxy does not
 * reliably cover Server Actions — an action POSTs to the route that invoked it
 * — so `src/proxy.ts` is a first line of defence and never the only one. That
 * matters more here than almost anywhere else: `ai:generate` spends the
 * agency's money, so an unchecked action is a way to bill a tenant from
 * outside it.
 *
 * ⚠️ GENERATION IS `ai:generate`; READING A STORED OUTPUT IS `ai:read`. §6.1's
 * split is deliberate — a Viewer may read an explanation somebody already paid
 * for and may not commission a new one.
 *
 * ⚠️ WEBSITE SCOPE IS CHECKED SEPARATELY FROM THE PERMISSION, and both are
 * required. §6.2 lets a member be invited with a website-scope restriction, and
 * `AgencyContext.websiteScope` carries it (empty = ALL websites, not none). A
 * permission answers "may this ROLE do it"; the scope answers "on WHICH sites".
 * `requirePermission` alone would let a scoped member commission — and read —
 * an AI summary of a website they were deliberately not given, which is
 * in-tenant and still unauthorized. Every action below therefore resolves the
 * `websiteId` the request actually concerns and passes it through
 * `assertWebsiteInScope`. Two of these take a `websiteId` straight from the
 * client, which is exactly the shape `requireWebsiteAccess` exists for.
 *
 * ⚠️ THESE ACTIONS RETURN FAILURES, THEY DO NOT THROW THEM. An AI outage must
 * render as an inline "temporarily unavailable" beside complete technical
 * detail, not as an error boundary that replaces the issue page (P3).
 */

/**
 * Rejects a website the caller's scope does not include.
 *
 * ⚠️ `NotFoundError`, NEVER a 403. §6.2: a 403 would confirm the website exists
 * in this agency, which is itself the disclosure the scope restriction was
 * meant to prevent. The same reason `requireWebsiteAccess` throws NotFound.
 */
function assertWebsiteInScope(ctx: AgencyContext, websiteId: string): void {
  if (!isWebsiteInScope(ctx.websiteScope, websiteId)) {
    throw new NotFoundError(t("error.notFound"), {
      reason: `WEBSITE_OUT_OF_SCOPE:${websiteId}:agency=${ctx.agencyId}`,
    });
  }
}

const explainIssueSchema = z.object({
  issueId: z.string().uuid(),
  feature: z.enum(["EXPLAIN_ISSUE", "RECOMMEND_FIX"]),
});

const driftSummarySchema = z.object({
  websiteId: z.string().uuid(),
  days: z.number().int().min(1).max(90).default(7),
});

const clientMessageSchema = z.object({
  websiteId: z.string().uuid(),
  issueIds: z.array(z.string().uuid()).min(1).max(5),
  /**
   * ⚠️ AN ENUM, NOT FREE TEXT. §8.8 ("prompt injection via user input"):
   * user-supplied free text is enum-constrained or excluded from prompts. Tone
   * is the only thing the user chooses about this prompt, so it is the only
   * thing that must not be a string they typed.
   */
  tone: z.enum(["reassuring", "factual", "urgent"]),
  fixInProgress: z.boolean(),
});

const feedbackSchema = z.object({
  requestId: z.string().uuid(),
  score: z.union([z.literal(-1), z.literal(0), z.literal(1)]),
});

export type AiActionResult = ActionResult<{
  output: unknown;
  requestId: string;
  fromCache: boolean;
}>;

/** Issue detail sections 7 (explanation) and 8 (recommended action). */
export async function generateIssueOutput(
  raw: z.infer<typeof explainIssueSchema>,
): Promise<AiActionResult> {
  try {
    const ctx = await requirePermission("ai:generate");

    const parsed = explainIssueSchema.safeParse(raw);
    if (!parsed.success) {
      throw new ValidationError(t("error.validation"), { reason: "AI_ISSUE_SCHEMA" });
    }

    const built = await buildIssueContextFor(ctx, parsed.data.issueId);
    if (!built) {
      // 404, never 403 — confirming the id exists in another tenant is itself
      // a disclosure (§6.2).
      throw new ValidationError(t("error.notFound"), {
        reason: `AI_ISSUE_MISSING:${parsed.data.issueId}`,
      });
    }

    /*
     * ⚠️ CHECKED AFTER RESOLUTION, because the caller names an ISSUE and the
     * scope is over WEBSITES — the link only exists once the row is read. The
     * read itself is already tenant-scoped, so this closes the narrower
     * in-tenant gap, and it fails as a 404 exactly like the resolution above.
     */
    assertWebsiteInScope(ctx, built.websiteId);

    const outcome = await callAI(ctx, {
      feature: parsed.data.feature,
      context: built.context,
      entityType: "issue",
      entityId: built.issueId,
      issueId: built.issueId,
    });

    if (!outcome.ok) {
      childLogger({ agencyId: ctx.agencyId }).warn(
        { errorCode: outcome.errorCode, feature: parsed.data.feature },
        "ai generation did not produce an output",
      );
      // ⚠️ A REJECTED OR BLOCKED CALL IS A RESULT, NOT AN EXCEPTION. The card
      // renders the matching unavailable state and the deterministic sections
      // above it are already complete.
      return {
        ok: false,
        code: outcome.errorCode,
        message: aiMessageFor(outcome.errorCode),
      };
    }

    revalidatePath(`/app/issues/${built.issueId}`);
    return actionOk({
      output: outcome.data,
      requestId: outcome.requestId,
      fromCache: outcome.fromCache,
    });
  } catch (error) {
    return actionFromError(error, "generateIssueOutput");
  }
}

/** Website Changes tab header and the dashboard drift widget (§8.5). */
export async function generateDriftSummary(
  raw: z.infer<typeof driftSummarySchema>,
): Promise<AiActionResult> {
  try {
    const ctx = await requirePermission("ai:generate");

    const parsed = driftSummarySchema.safeParse(raw);
    if (!parsed.success) {
      throw new ValidationError(t("error.validation"), { reason: "AI_DRIFT_SCHEMA" });
    }

    // ⚠️ BEFORE the read: the id came straight from the client.
    assertWebsiteInScope(ctx, parsed.data.websiteId);

    const built = await buildDriftContextFor(
      ctx,
      parsed.data.websiteId,
      parsed.data.days,
    );
    if (!built) {
      // No website, or no events in the window. Either way there is nothing to
      // summarise and no call to make.
      return {
        ok: false,
        code: "NO_DRIFT_EVENTS",
        message: t("ai.noDriftToSummarise"),
      };
    }

    const outcome = await callAI(ctx, {
      feature: "SUMMARIZE_DRIFT",
      context: built.context,
      entityType: "website",
      entityId: parsed.data.websiteId,
    });

    if (!outcome.ok) {
      return {
        ok: false,
        code: outcome.errorCode,
        message: aiMessageFor(outcome.errorCode),
      };
    }

    revalidatePath(`/app/websites/${parsed.data.websiteId}/changes`);
    return actionOk({
      output: outcome.data,
      requestId: outcome.requestId,
      fromCache: outcome.fromCache,
    });
  } catch (error) {
    return actionFromError(error, "generateDriftSummary");
  }
}

/**
 * §8.5 feature 4.
 *
 * ⚠️ THIS PRODUCES A DRAFT AND SENDS NOTHING. Feature doc 16: "Client messages
 * are drafts requiring human edit." The output goes into an editable textarea
 * with copy and "open in email client"; there is deliberately no code path from
 * here to `@pdm/email`, because the one AI output most likely to reach a third
 * party is the one that must pass a human first.
 */
export async function generateClientMessage(
  raw: z.infer<typeof clientMessageSchema>,
): Promise<AiActionResult> {
  try {
    const ctx = await requirePermission("ai:generate");

    const parsed = clientMessageSchema.safeParse(raw);
    if (!parsed.success) {
      throw new ValidationError(t("error.validation"), { reason: "AI_MESSAGE_SCHEMA" });
    }

    assertWebsiteInScope(ctx, parsed.data.websiteId);

    const context = await buildClientMessageContextFor(ctx, parsed.data);
    if (!context) {
      throw new ValidationError(t("error.notFound"), {
        reason: `AI_MESSAGE_SUBJECT_MISSING:${parsed.data.websiteId}`,
      });
    }

    const outcome = await callAI(ctx, {
      feature: "CLIENT_MESSAGE",
      context,
      entityType: "website",
      entityId: parsed.data.websiteId,
    });

    if (!outcome.ok) {
      return {
        ok: false,
        code: outcome.errorCode,
        message: aiMessageFor(outcome.errorCode),
      };
    }

    return actionOk({
      output: outcome.data,
      requestId: outcome.requestId,
      fromCache: outcome.fromCache,
    });
  } catch (error) {
    return actionFromError(error, "generateClientMessage");
  }
}

/**
 * §8.8's feedback loop — thumbs up/down on every output.
 *
 * `ai:read`, not `ai:generate`: rating costs nothing, and the people best
 * placed to say an explanation was wrong are the ones reading it.
 */
export async function submitAiFeedback(
  raw: z.infer<typeof feedbackSchema>,
): Promise<ActionResult<{ requestId: string }>> {
  try {
    const ctx = await requirePermission("ai:read");

    const parsed = feedbackSchema.safeParse(raw);
    if (!parsed.success) {
      throw new ValidationError(t("error.validation"), { reason: "AI_FEEDBACK_SCHEMA" });
    }

    const repos = repositoriesFor(ctx.agencyId);
    const updated = await repos.ai.setFeedback(parsed.data.requestId, parsed.data.score);
    if (!updated) {
      throw new ValidationError(t("error.notFound"), {
        reason: `AI_REQUEST_MISSING:${parsed.data.requestId}`,
      });
    }

    return actionOk({ requestId: parsed.data.requestId });
  } catch (error) {
    return actionFromError(error, "submitAiFeedback");
  }
}

/**
 * One user-facing sentence per failure code.
 *
 * ⚠️ EVERY ONE OF THESE SAYS WHAT IS STILL TRUE, not just what failed. §12.3's
 * required string is "AI explanations are temporarily unavailable. The
 * technical details above are complete." — the second sentence is the one that
 * matters, because it tells the reader the page is not missing anything they
 * need. A bare "something went wrong" would make an additive feature look like
 * a broken one.
 */
function aiMessageFor(code: string): string {
  switch (code) {
    case "QUOTA_EXCEEDED":
      return t("ai.quotaExceeded");
    case "PLATFORM_BUDGET_EXCEEDED":
    case "PROVIDER_UNAVAILABLE":
      return t("ai.unavailable");
    case "AI_DISABLED":
      return t("ai.disabled");
    case "GROUNDING_FAILED":
    case "TERMINOLOGY_REJECTED":
    case "CLAIM_REJECTED":
    case "VALIDATION_FAILED":
      // ⚠️ THE USER IS TOLD THE OUTPUT WAS REJECTED, not that it "failed". The
      // validator working is the product working — §8.8's whole design is that
      // a rejected response is a safe outcome, and the copy should not
      // apologise for the control that protected them.
      return t("ai.rejected");
    default:
      return t("ai.unavailable");
  }
}
