import { describe, expect, it } from "vitest";
import { enums } from "@pdm/schemas";
import {
  AI_FEATURES,
  GROUNDING_FIELD,
  MVP_AI_FEATURES,
  OUTPUT_SCHEMAS,
  PROMPTS,
} from "@pdm/ai";
import { Prisma } from "../tenant";

/**
 * ZOD ↔ PRISMA ENUM PARITY.
 *
 * `packages/schemas/src/enums.ts` duplicates every Prisma enum so the API
 * boundary and the worker can validate without a database. Duplication without
 * a test is just drift with extra steps: before this existed, ten of the
 * eighteen shared enums disagreed with `schema.prisma` — `issueStatus` was
 * missing `UNVERIFIED`, `riskLevel` was missing `CRITICAL` (which the tracker
 * seed file uses), and `aiFeature` shared no members at all.
 *
 * This test lives in `packages/database` rather than `packages/schemas` because
 * it is the only workspace that can read the generated Prisma DMMF. The
 * dependency is dev-only and one-directional, so there is no cycle.
 */

/** Zod enum export name → Prisma enum name. */
const PAIRS: ReadonlyArray<readonly [keyof typeof enums, string]> = [
  ["agencyRole", "AgencyRole"],
  ["agencyStatus", "AgencyStatus"],
  ["memberStatus", "MemberStatus"],
  ["monitoringStatus", "MonitoringStatus"],
  ["scanFrequency", "ScanFrequency"],
  ["scanPriority", "ScanPriority"],
  ["alertProfile", "AlertProfile"],
  ["screenshotPolicy", "ScreenshotPolicy"],
  ["scoreConfidence", "ScoreConfidence"],
  ["scanStatus", "ScanStatus"],
  ["scanTrigger", "ScanTrigger"],
  ["consentPhase", "ConsentPhase"],
  ["phaseStatus", "PhaseStatus"],
  ["severity", "Severity"],
  ["issueCategory", "IssueCategory"],
  ["issueStatus", "IssueStatus"],
  ["issueResolution", "IssueResolution"],
  ["evidenceKind", "EvidenceKind"],
  ["trackerCategory", "TrackerCategory"],
  ["riskLevel", "RiskLevel"],
  ["driftChangeType", "DriftChangeType"],
  ["reportType", "ReportType"],
  ["reportStatus", "ReportStatus"],
  ["notificationType", "NotificationType"],
  ["digestFrequency", "DigestFrequency"],
  ["portalUserStatus", "PortalUserStatus"],
  ["subscriptionStatus", "SubscriptionStatus"],
  ["billingInterval", "BillingInterval"],
  ["usageMetric", "UsageMetric"],
  ["aiModelTier", "AiModelTier"],
  ["aiFeature", "AIFeature"],
  ["aiRequestStatus", "AIRequestStatus"],
  ["jurisdiction", "Jurisdiction"],
  ["geoEgressRegion", "GeoEgressRegion"],
  ["deliveryStatus", "DeliveryStatus"],
];

const prismaEnums = new Map(
  Prisma.dmmf.datamodel.enums.map((e) => [
    e.name,
    e.values.map((v) => v.name),
  ]),
);

describe("shared Zod enums mirror the Prisma schema", () => {
  for (const [zodKey, prismaName] of PAIRS) {
    it(`${zodKey} === ${prismaName}`, () => {
      const prismaValues = prismaEnums.get(prismaName);
      expect(prismaValues, `no Prisma enum named ${prismaName}`).toBeDefined();

      // Order reads as documentation, but only membership matters for
      // correctness — compare as sorted sets so a reorder is not a failure.
      const zodValues = [...(enums[zodKey].options as readonly string[])];
      expect(zodValues.sort()).toEqual([...prismaValues!].sort());
    });
  }

  it("covers every Prisma enum", () => {
    const paired = new Set(PAIRS.map(([, prismaName]) => prismaName));
    const unpaired = [...prismaEnums.keys()].filter((n) => !paired.has(n));

    expect(
      unpaired,
      `Prisma enums with no Zod counterpart: ${unpaired.join(", ")}`,
    ).toEqual([]);
  });
});

/**
 * `packages/ai` HOLDS A THIRD COPY of `AIFeature`, for the same reason
 * `packages/scanner` restates `ScanTrigger`: it must stay testable with no
 * database, so it cannot import the generated client. `packages/ai/src/types.ts`
 * says a member that drifts "fails at the persistence boundary, which is why it
 * must match exactly" — this is the test that makes that true at build time
 * instead of at 3am.
 */
describe("packages/ai mirrors the Prisma AI enums", () => {
  it("AI_FEATURES === AIFeature", () => {
    expect([...AI_FEATURES].sort()).toEqual(
      [...(prismaEnums.get("AIFeature") ?? [])].sort(),
    );
  });

  it("every MVP feature is a real AIFeature", () => {
    for (const feature of MVP_AI_FEATURES) {
      expect(prismaEnums.get("AIFeature")).toContain(feature);
    }
  });

  it("every prompt has an output schema and a declared grounding field", () => {
    // ⚠️ A feature that can be PROMPTED but has no grounding entry would be
    // validated against an empty ref set. `validate.ts` fails closed on an
    // absent entry; this catches it a release earlier.
    for (const feature of Object.keys(PROMPTS)) {
      expect(OUTPUT_SCHEMAS).toHaveProperty(feature);
      expect(Object.hasOwn(GROUNDING_FIELD, feature)).toBe(true);
    }
  });
});
