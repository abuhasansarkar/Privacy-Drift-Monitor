import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@pdm/database";
import { repositoriesFor } from "@pdm/database/repositories";
import { makeAgency, resetDatabase } from "@pdm/database/testing";
import type { EmailTransport, SendEmailInput } from "@pdm/email";
import { resetBrandingCache } from "@pdm/reports";
import { PLATFORM_BRAND_NAME } from "@pdm/shared/branding";
import { processEmailJob } from "../email.job";

/**
 * THE FROM LINE — §6.9's entitlement, asserted where it is actually composed.
 *
 * ⚠️ THIS FILE EXISTS BECAUSE A DELIVERED EMAIL FOUND THE BUG, NOT A TEST.
 * `email.job.ts` passed `whiteLabelEnabled: CLIENT_FACING.has(template)` — an
 * EXPRESSION, so it survived a grep for the literal `whiteLabelEnabled: true` —
 * which forced white-label on for every client-facing template regardless of
 * plan. The branding resolver's own tests were green throughout, because the
 * job never asked it the right question.
 *
 * The lesson worth keeping: the resolver decides the ENTITLEMENT; the job
 * decides whether the template is CLIENT-FACING. Two questions, and conflating
 * them gave away a paid feature.
 */

let agency: Awaited<ReturnType<typeof makeAgency>>;

/** Captures what would have been posted, and sends nothing. */
function recordingTransport() {
  const state: { last: SendEmailInput | null } = { last: null };
  const transport: EmailTransport = {
    async send(input: SendEmailInput) {
      state.last = input;
      return { providerId: `test-${Math.random().toString(36).slice(2)}`, simulated: true };
    },
  };
  return { transport, state };
}

function job(template: string, key: string) {
  return {
    agencyId: agency.id,
    message:
      template === "portal-magic-link"
        ? { template, data: { magicLinkPath: "/portal/auth?token=x" } }
        : { template, data: { days: 3 } },
    to: "contact@client.test",
    userId: null,
    alertRuleId: null,
    notificationType: null,
    entityType: "portal_user",
    entityId: null,
    idempotencyKey: key,
  } as never;
}

beforeAll(async () => {
  await resetDatabase();
  agency = await makeAgency({ name: "Acme Web Studio" });

  // Branding IS saved. The entitlement, not the absence of data, is what must
  // keep it out of the From line.
  await repositoriesFor(agency.id).branding.upsert({
    companyName: "Acme Web Studio",
    logoLightUrl: null,
    logoDarkUrl: null,
    primaryColor: "#B91C1C",
    accentColor: "#F97316",
    contactEmail: "hello@acme.test",
    contactPhone: null,
    reportFooterText: null,
    customDisclaimer: null,
    portalWelcomeText: null,
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("email From line", () => {
  it("uses OUR name on a client-facing template when the plan has no white-label", async () => {
    resetBrandingCache();
    const { transport, state } = recordingTransport();

    await processEmailJob(job("portal-magic-link", `t1-${Date.now()}`), { transport });

    expect(state.last?.from.name).toBe(PLATFORM_BRAND_NAME);
    // The exact regression: the agency's saved name reaching a client's inbox
    // without the entitlement that pays for it.
    expect(state.last?.from.name).not.toBe("Acme Web Studio");
  });

  it("uses OUR name on internal mail too", async () => {
    resetBrandingCache();
    const { transport, state } = recordingTransport();

    await processEmailJob(job("trial-ending", `t2-${Date.now()}`), { transport });

    expect(state.last?.from.name).toBe(PLATFORM_BRAND_NAME);
  });

  it("always sends from OUR verified address, whatever the display name", async () => {
    resetBrandingCache();
    const { transport, state } = recordingTransport();

    await processEmailJob(job("portal-magic-link", `t3-${Date.now()}`), { transport });

    // The address is the domain verified with the provider — it can never be
    // the agency's, or nothing would deliver.
    expect(state.last?.from.email).not.toContain("acme");
    expect(state.last?.from.email).toContain("@");
  });

  it("records the send in AlertHistory", async () => {
    resetBrandingCache();
    const { transport } = recordingTransport();
    const key = `t4-${Date.now()}`;

    await processEmailJob(job("portal-magic-link", key), { transport });

    const history = await repositoriesFor(agency.id).alerts.listHistory({ limit: 20 });
    const row = history.items.find((entry) => entry.idempotencyKey?.startsWith(key));
    expect(row?.recipients).toContain("contact@client.test");
    // The stub reports `simulated`, and the History tab must show exactly that
    // — never `sent`, which would be a lie the agency would then read.
    expect(row?.status).toBe("simulated");
  });
});
