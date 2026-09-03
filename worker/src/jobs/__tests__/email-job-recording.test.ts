import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@pdm/database";
import { makeAgency, resetDatabase } from "@pdm/database/testing";
import type { EmailTransport, SendEmailInput } from "@pdm/email";
import { resetBrandingCache } from "@pdm/reports";
import type { EmailJobData } from "@pdm/scanner/queue/queues";
import { processEmailJob } from "../email.job";

/**
 * THE EMAIL JOB MUST NOT FAIL AFTER A SUCCESSFUL SEND.
 *
 * ⚠️ THE REGRESSION THIS FILE LOCKS: a team invitation queued
 * `notificationType: "TEAM_INVITATION"` — not a `NotificationType` — the send
 * SUCCEEDED, `recordStatus` then threw writing `AlertHistory`, the throw
 * failed the job, BullMQ retried eight times, and `hasBeenDelivered` (which
 * reads the history row that never got written) let every attempt resend.
 * Eight identical invitations, no history row.
 *
 * The contract, in order of importance:
 *   1. A recording failure after a successful send is LOGGED, never thrown —
 *      the email is already gone; failing the job can only duplicate it.
 *   2. Transactional mail (null type) records a NULL `AlertHistory.type` —
 *      never a fabricated `REPORT_READY` the History tab would echo as truth.
 *   3. An alert-typed send records the trigger that produced it.
 */
let agency: Awaited<ReturnType<typeof makeAgency>>;

/** Captures every send, and sends nothing. */
function recordingTransport() {
  const state: { last: SendEmailInput | null; sends: number } = { last: null, sends: 0 };
  const transport: EmailTransport = {
    async send(input: SendEmailInput) {
      state.last = input;
      state.sends += 1;
      return { providerId: `test-${state.sends}`, simulated: true };
    },
  };
  return { transport, state };
}

function job(overrides: Partial<EmailJobData> = {}): EmailJobData {
  return {
    agencyId: agency.id,
    message: { template: "trial-ending", data: { days: 3 } },
    to: "owner@agency.test",
    userId: null,
    alertRuleId: null,
    notificationType: "TRIAL_ENDING",
    entityType: null,
    entityId: null,
    idempotencyKey: `rec-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    ...overrides,
  };
}

beforeAll(async () => {
  await resetDatabase();
  agency = await makeAgency({ name: "Recording Test Studio" });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("email job recording", () => {
  it("⚠️ does NOT fail the job when recording fails after a successful send", async () => {
    resetBrandingCache();
    const { transport, state } = recordingTransport();
    // The exact production literal, expressed the only way the type system now
    // permits — through the `as never` the ORIGINAL call site used. The cast is
    // the point: it reproduces what production did, so the assertion proves the
    // job survives it.
    const data = job({ notificationType: "TEAM_INVITATION" as never });

    const result = await processEmailJob(data, { transport });

    // The job RESOLVED — BullMQ has no failure to retry...
    expect(result.sent).toBe(true);
    // ...and it sent EXACTLY ONCE, because a retry would resend a delivered mail.
    expect(state.sends).toBe(1);
  });

  it("records transactional mail with a NULL type, never a fabricated one", async () => {
    resetBrandingCache();
    const { transport } = recordingTransport();
    const data = job({
      message: { template: "portal-magic-link", data: { magicLinkPath: "/portal/auth?token=x" } },
      to: "contact@client.test",
      notificationType: null,
      entityType: "portal_user",
    });

    await processEmailJob(data, { transport });

    // The job records the outcome under `<queued key>:<status>` (email.job.ts)
    // so it never collides with the queued row on the unique index.
    const row = await prisma.alertHistory.findUnique({
      where: { idempotencyKey: `${data.idempotencyKey}:simulated` },
    });
    expect(row).not.toBeNull();
    // The old `?? "REPORT_READY"` fallback made the History tab call a magic
    // link "report ready". Null is the truth: a send no alert rule produced.
    expect(row?.type).toBeNull();
    expect(row?.status).toBe("simulated");
    expect(row?.recipients).toContain("contact@client.test");
  });

  it("records an alert-typed send under the trigger that produced it", async () => {
    resetBrandingCache();
    const { transport } = recordingTransport();
    const data = job({ notificationType: "TRIAL_ENDING" });

    await processEmailJob(data, { transport });

    const row = await prisma.alertHistory.findUnique({
      where: { idempotencyKey: `${data.idempotencyKey}:simulated` },
    });
    expect(row?.type).toBe("TRIAL_ENDING");
    expect(row?.status).toBe("simulated");
  });
});
