import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { unsafeGlobalClient } from "@pdm/database";
import { childLogger } from "@pdm/shared/logger";

/**
 * RESEND DELIVERY WEBHOOKS — PLAN.md Part IX §9.5.
 *
 * `email.delivered`, `.bounced`, `.complained`, `.opened` update `AlertHistory`,
 * so the Alerts → History tab can answer "did our client's contact actually
 * receive Tuesday's alert?" — §3.11 requires that column, and it is only real
 * if these land.
 *
 * ⚠️ A HARD BOUNCE MARKS THE ADDRESS UNDELIVERABLE (§9.5) and the dispatcher
 * then stops emailing it. Silently continuing to send to a dead mailbox is how
 * an agency believes they are being alerted while nothing arrives.
 *
 * ⚠️ THE SIGNATURE IS VERIFIED BEFORE THE BODY IS PARSED. This endpoint is
 * public (`proxy.ts` exempts `/api/webhooks`), so an unverified payload is an
 * unauthenticated write to delivery records.
 *
 * ⚠️ ALWAYS 200 ONCE VERIFIED, even on an unknown event type. A non-2xx makes
 * Resend retry indefinitely for an event we will never handle.
 */

const db = unsafeGlobalClient(
  // Justification (required in review): a webhook arrives with no session and
  // no tenant. The agency is DERIVED from the `AlertHistory` row the provider
  // id matches — never taken from the payload.
  "delivery webhooks resolve a tenant from the provider id, not from a session",
);

const log = childLogger({ component: "email" });

/** Svix-style headers, which is what Resend uses. */
function verify(payload: string, headers: Headers, secret: string): boolean {
  const id = headers.get("svix-id");
  const timestamp = headers.get("svix-timestamp");
  const signature = headers.get("svix-signature");
  if (!id || !timestamp || !signature) return false;

  // Replay window: a captured request must not stay valid indefinitely.
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 5 * 60) return false;

  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key)
    .update(`${id}.${timestamp}.${payload}`)
    .digest("base64");

  // The header carries a space-separated list of `v1,<sig>` entries.
  return signature.split(" ").some((entry) => {
    const candidate = entry.split(",")[1];
    if (!candidate) return false;
    const a = Buffer.from(candidate);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  });
}

interface ResendEvent {
  type?: string;
  data?: { email_id?: string; to?: string[]; bounce?: { type?: string } };
}

export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  const payload = await request.text();

  if (!secret) {
    // Fail closed. An unsigned endpoint that writes delivery status is an
    // unauthenticated write, and "not configured yet" is not a reason to
    // accept one.
    log.error("RESEND_WEBHOOK_SECRET is not set; webhook rejected");
    return NextResponse.json(
      { error: { code: "AUTHENTICATION_ERROR", message: "Not configured." } },
      { status: 401 },
    );
  }

  if (!verify(payload, request.headers, secret)) {
    log.warn("resend webhook signature rejected");
    return NextResponse.json(
      { error: { code: "AUTHENTICATION_ERROR", message: "Invalid signature." } },
      { status: 401 },
    );
  }

  let event: ResendEvent;
  try {
    event = JSON.parse(payload) as ResendEvent;
  } catch {
    // Verified but unparseable: acknowledged so it is not retried forever.
    return NextResponse.json({ received: true });
  }

  const providerId = event.data?.email_id;
  const status = mapStatus(event.type);
  if (!providerId || !status) return NextResponse.json({ received: true });

  const updated = await db.alertHistory.updateMany({
    where: { providerId },
    data: {
      status,
      ...(status === "delivered" ? { deliveredAt: new Date() } : {}),
      ...(status === "opened" ? { openedAt: new Date() } : {}),
      ...(status === "bounced" || status === "complained"
        ? { errorMessage: event.data?.bounce?.type ?? event.type ?? null }
        : {}),
    },
  });

  /*
   * ⚠️ ONLY A HARD BOUNCE MARKS THE ADDRESS DEAD. A soft bounce is a full
   * mailbox or a temporary server fault, and permanently disabling email to
   * someone over one of those is a monitoring product that quietly stopped
   * telling them things.
   */
  const isHardBounce =
    event.type === "email.bounced" && event.data?.bounce?.type !== "Transient";

  if (isHardBounce || event.type === "email.complained") {
    for (const address of event.data?.to ?? []) {
      await db.user
        .updateMany({
          where: { email: address, emailUndeliverableAt: null },
          data: { emailUndeliverableAt: new Date() },
        })
        .catch((error) => log.warn({ err: error }, "could not mark address undeliverable"));
    }
  }

  log.info({ providerId, status, matched: updated.count }, "resend webhook processed");
  return NextResponse.json({ received: true });
}

function mapStatus(type: string | undefined): string | null {
  switch (type) {
    case "email.sent":
      return "sent";
    case "email.delivered":
      return "delivered";
    case "email.opened":
      return "opened";
    case "email.bounced":
      return "bounced";
    case "email.complained":
      return "complained";
    case "email.delivery_delayed":
      return "queued";
    default:
      return null;
  }
}
