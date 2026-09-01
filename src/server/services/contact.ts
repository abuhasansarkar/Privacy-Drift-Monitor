import "server-only";
import { z } from "zod";
import { checkRateLimit, rateLimitKey } from "@pdm/shared";
import { track } from "@pdm/shared/analytics";
import { logger } from "@pdm/shared/logger";
import { verifyTurnstile } from "@pdm/shared/turnstile";
import { emailQueue, rateLimitStore } from "@/server/services/queues";

/**
 * THE CONTACT FORM — PLAN.md §3.2, Phase 6.
 *
 * §3.2: "form (name, email, agency, site count, message, topic) → Zod
 * validated → Turnstile → Resend to support + confirmation to sender →
 * `contact_form_submitted`. Success/error inline states; **honeypot field**."
 *
 * ⚠️ THE HONEYPOT IS CHECKED FIRST AND SUCCEEDS SILENTLY. Telling a bot it was
 * detected is telling whoever wrote it what to change. A form that returns 200
 * and drops the message costs the operator nothing and costs the spammer their
 * feedback loop.
 *
 * ⚠️ AN IP RATE LIMIT AS WELL AS TURNSTILE. A challenge stops scripts; it does
 * not stop a person pasting the same message forty times, and the mailbox on
 * the other end is a human's.
 */

export const contactSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email().max(200),
  agency: z.string().max(160).optional().or(z.literal("")),
  siteCount: z.string().max(40).optional().or(z.literal("")),
  topic: z.enum(["sales", "support", "security", "other"]),
  message: z.string().min(10).max(4_000),
  turnstileToken: z.string().max(4_096).optional(),
  /** ⚠️ MUST BE EMPTY. A real browser never fills a hidden field. */
  website: z.string().max(200).optional(),
});

export type ContactInput = z.infer<typeof contactSchema>;

export type ContactOutcome =
  | { ok: true }
  | { ok: false; code: "INVALID" | "CHALLENGE_FAILED" | "RATE_LIMITED" | "FAILED" };

/** §3.2: three per hour is generous for a human and useless to a spammer. */
const RATE = { limit: 3, windowSeconds: 3_600 };

export async function submitContact(
  input: ContactInput,
  ip: string | null,
): Promise<ContactOutcome> {
  // 1. Honeypot. Silent success — see the note above.
  if (input.website && input.website.trim().length > 0) {
    logger.info({ component: "contact" }, "honeypot triggered; message dropped");
    return { ok: true };
  }

  // 2. Challenge.
  const challenge = await verifyTurnstile({
    token: input.turnstileToken ?? "",
    remoteIp: ip,
  });
  if (!challenge.success) return { ok: false, code: "CHALLENGE_FAILED" };

  // 3. Rate limit, per network.
  const limit = await checkRateLimit(
    rateLimitStore(),
    rateLimitKey("contact", ip ?? "unknown"),
    RATE,
  );
  if (!limit.allowed) return { ok: false, code: "RATE_LIMITED" };

  const supportAddress = process.env.SUPPORT_EMAIL;
  if (!supportAddress) {
    /*
     * ⚠️ NO SUPPORT ADDRESS IS A CONFIGURATION FAILURE, NOT A USER ERROR — and
     * it must not present as success. A contact form that silently discards
     * messages is the worst possible failure mode for this page: the sender
     * believes they have been heard and waits.
     */
    logger.error({ component: "contact" }, "SUPPORT_EMAIL is unset; message not delivered");
    return { ok: false, code: "FAILED" };
  }

  try {
    const summary = [
      `From: ${input.name} <${input.email}>`,
      input.agency ? `Agency: ${input.agency}` : null,
      input.siteCount ? `Sites: ${input.siteCount}` : null,
      `Topic: ${input.topic}`,
      "",
      input.message,
    ]
      .filter(Boolean)
      .join("\n");

    /*
     * ⚠️ THE CONFIRMATION GOES THROUGH THE EMAIL QUEUE, like every other send
     * (§9.5) — "so a Resend outage never blocks a request". The support copy
     * rides the same template; there is no second transport.
     */
    await emailQueue().add("contact", {
      agencyId: "",
      to: supportAddress,
      message: { template: "support-received", data: { message: summary } },
      userId: null,
      alertRuleId: null,
      notificationType: null,
      entityType: "contact",
      entityId: null,
      idempotencyKey: `contact-${input.email}-${Date.now()}`,
    });

    await emailQueue().add("contact-ack", {
      agencyId: "",
      to: input.email,
      message: { template: "support-received", data: { message: input.message } },
      userId: null,
      alertRuleId: null,
      notificationType: null,
      entityType: "contact-ack",
      entityId: null,
      idempotencyKey: `contact-ack-${input.email}-${Date.now()}`,
    });

    // ⚠️ THE TOPIC, NEVER THE MESSAGE OR THE ADDRESS (§9.6).
    void track("contact_form_submitted", { topic: input.topic });
    return { ok: true };
  } catch (error) {
    logger.error({ component: "contact", err: error }, "contact submission failed");
    return { ok: false, code: "FAILED" };
  }
}
