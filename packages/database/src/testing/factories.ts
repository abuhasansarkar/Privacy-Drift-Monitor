import { randomUUID } from "node:crypto";
import { prisma } from "../client";
import type { Agency, Client, Scan, User, Website } from "@prisma/client";

/**
 * Typed test factories. PLAN.md §12.2: "Never hand-build fixtures."
 *
 * Every factory takes a partial override so a test states only what it cares
 * about. Everything else gets a sane, unique default.
 */

let counter = 0;
const uniq = (prefix: string) => `${prefix}-${++counter}-${randomUUID().slice(0, 8)}`;

export async function makeUser(overrides: Partial<User> = {}): Promise<User> {
  const slug = uniq("user");
  return prisma.user.create({
    data: {
      clerkUserId: overrides.clerkUserId ?? `user_${slug}`,
      email: overrides.email ?? `${slug}@example.test`,
      firstName: overrides.firstName ?? "Test",
      lastName: overrides.lastName ?? "User",
      timezone: overrides.timezone ?? "Europe/London",
      isSuperAdmin: overrides.isSuperAdmin ?? false,
    },
  });
}

export async function makeAgency(
  overrides: Partial<Agency> & { ownerUserId?: string } = {},
): Promise<Agency & { ownerId: string }> {
  const slug = overrides.slug ?? uniq("agency");
  const agency = await prisma.agency.create({
    data: {
      clerkOrgId: overrides.clerkOrgId ?? `org_${slug}`,
      name: overrides.name ?? `Test Agency ${slug}`,
      slug,
      timezone: overrides.timezone ?? "Europe/London",
      status: overrides.status ?? "ACTIVE",
    },
  });

  const owner = overrides.ownerUserId
    ? { id: overrides.ownerUserId }
    : await makeUser();

  await prisma.agencyMember.create({
    data: { agencyId: agency.id, userId: owner.id, role: "OWNER" },
  });

  return { ...agency, ownerId: owner.id };
}

export async function makeClient(
  agencyId: string,
  overrides: Partial<Client> = {},
): Promise<Client> {
  const slug = overrides.slug ?? uniq("client");
  return prisma.client.create({
    data: {
      agencyId,
      name: overrides.name ?? `Test Client ${slug}`,
      slug,
      contactEmail: overrides.contactEmail ?? `${slug}@client.test`,
      portalEnabled: overrides.portalEnabled ?? false,
    },
  });
}

export async function makeWebsite(
  agencyId: string,
  overrides: Partial<Website> = {},
): Promise<Website> {
  const host = overrides.host ?? `${uniq("site")}.example.test`;
  const url = overrides.url ?? `https://${host}/`;
  return prisma.website.create({
    data: {
      agencyId,
      clientId: overrides.clientId ?? null,
      url,
      originalUrl: overrides.originalUrl ?? url,
      registrableDomain: overrides.registrableDomain ?? "example.test",
      host,
      monitoringStatus: overrides.monitoringStatus ?? "ACTIVE",
      scanFrequency: overrides.scanFrequency ?? "WEEKLY",
      monitoredPaths: overrides.monitoredPaths ?? ["/"],
      healthScore: overrides.healthScore ?? null,
      nextScanAt: overrides.nextScanAt ?? new Date(Date.now() + 86_400_000),
    },
  });
}

export async function makeScan(
  agencyId: string,
  websiteId: string,
  overrides: Partial<Scan> = {},
): Promise<Scan> {
  return prisma.scan.create({
    data: {
      agencyId,
      websiteId,
      status: overrides.status ?? "COMPLETED",
      trigger: overrides.trigger ?? "SCHEDULED",
      scannerVersion: overrides.scannerVersion ?? "test-1.0.0",
      startedAt: overrides.startedAt ?? new Date(),
      finishedAt: overrides.finishedAt ?? new Date(),
      durationMs: overrides.durationMs ?? 150_000,
      healthScore: overrides.healthScore ?? 78,
      scoreConfidence: overrides.scoreConfidence ?? "FULL",
    },
  });
}

/**
 * A scan with a realistic evidence tail — four consent phases, a pre-consent
 * tracker request, the cookie it set, and the issue plus evidence rows that the
 * rule engine would produce. Use this wherever a test needs a scan that looks
 * like a real one rather than an empty shell.
 */
export async function makeScanWithEvidence(
  agencyId: string,
  websiteId: string,
  overrides: Partial<Scan> = {},
) {
  const scan = await makeScan(agencyId, websiteId, overrides);

  await prisma.scanPhase.createMany({
    data: (["NO_CONSENT", "REJECT_ALL", "ACCEPT_ALL", "WITHDRAW"] as const).map(
      (phase) => ({
        scanId: scan.id,
        agencyId,
        phase,
        status: "EXECUTED" as const,
        durationMs: 30_000,
        actionMethod: "adapter_selector",
        actionConfidence: 1,
        bannerDismissed: true,
      }),
    ),
  });

  const request = await prisma.networkRequest.create({
    data: {
      scanId: scan.id,
      agencyId,
      pageUrl: "https://example.test/",
      consentPhase: "NO_CONSENT",
      url: "https://connect.facebook.net/en_US/fbevents.js",
      method: "GET",
      resourceType: "script",
      host: "connect.facebook.net",
      registrableDomain: "facebook.net",
      isThirdParty: true,
      status: 200,
      initiatorType: "script",
      initiatorUrl: "https://www.googletagmanager.com/gtm.js",
      timestampMs: 1842,
    },
  });

  await prisma.cookieRecord.create({
    data: {
      scanId: scan.id,
      agencyId,
      consentPhase: "NO_CONSENT",
      snapshotPoint: "phase_end",
      name: "_fbp",
      domain: ".example.test",
      path: "/",
      isSession: false,
      durationDays: 90,
      secure: true,
      httpOnly: false,
      sameSite: "Lax",
      isThirdParty: false,
      valueHash: "sha256:test",
      valueLength: 32,
      category: "MARKETING",
    },
  });

  const issue = await prisma.issue.create({
    data: {
      agencyId,
      websiteId,
      firstScanId: scan.id,
      lastScanId: scan.id,
      ruleId: "PDM-R001",
      ruleVersion: 1,
      fingerprint: `PDM-R001:${websiteId}:meta-pixel`,
      category: "PRE_CONSENT_TRACKING",
      severity: "CRITICAL",
      status: "NEW",
      confidence: 0.97,
      title: "Marketing tracker detected before consent",
      message: "A marketing tracker was detected before consent was given.",
      technicalReason:
        "A request to connect.facebook.net was observed 1842 ms after navigation, under consent state NO_CONSENT.",
      recommendedAction:
        "Move the tag behind consent in your CMP or tag manager, then re-scan to verify.",
      firstDetectedAt: new Date(),
      lastSeenAt: new Date(),
    },
  });

  const evidence = await prisma.issueEvidence.create({
    data: {
      issueId: issue.id,
      scanId: scan.id,
      agencyId,
      kind: "NETWORK_REQUEST",
      pageUrl: "https://example.test/",
      consentPhase: "NO_CONSENT",
      observedAtMs: 1842,
      detectionRuleId: "PDM-R001",
      detectionRuleVersion: 1,
      confidence: 0.97,
      payload: { networkRequestId: request.id, host: "connect.facebook.net" },
    },
  });

  return { scan, request, issue, evidence };
}

/** Truncates every table. Call between integration tests. */
export async function resetDatabase() {
  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename NOT LIKE '_prisma%'
  `;
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(", ");
  if (list) {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} CASCADE;`);
  }
}
