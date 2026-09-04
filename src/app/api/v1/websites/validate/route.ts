import { z } from "zod";
import type { UrlValidationResult } from "@pdm/schemas";
import { t } from "@pdm/shared/copy";
import { requirePermission } from "@/server/auth/context";
import { validateWebsiteUrl } from "@/server/services/website-validation";

/**
 * URL VALIDATION — §6.4, Phase 1 task 1.7, feature 04.
 *
 * The pre-flight the Add Website wizard runs before anything is created. The
 * chain itself lives in `server/services/website-validation.ts` because
 * `createWebsite()` has to run the SAME checks — see the note there on why the
 * action cannot trust a URL this endpoint has already blessed.
 *
 * ⚠️ Every rejection returns HTTP 200 with `ok: false` and a code. The failure
 * is about the submitted address, not about this request, and the wizard has
 * one rendering path for all of them.
 */

const bodySchema = z.object({ url: z.string().trim().min(1).max(2048) });

export async function POST(request: Request) {
  // Authorization is re-checked here and not inherited from the proxy — this is
  // a route handler, but the same rule that governs Server Actions applies:
  // the gate lives with the thing being protected (§6.1).
  const ctx = await requirePermission("website:create");

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const body: UrlValidationResult = {
      ok: false,
      normalizedUrl: null,
      registrableDomain: null,
      upgradedToHttps: false,
      redirectsTo: null,
      code: "INVALID_URL",
      message: t("urlError.invalid"),
    };
    return Response.json(body);
  }

  const outcome = await validateWebsiteUrl(ctx, parsed.data.url);
  return Response.json(outcome.result);
}
