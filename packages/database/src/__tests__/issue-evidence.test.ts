import { beforeEach, describe, expect, it } from "vitest";
import { repositoriesFor } from "../repositories";
import type { FindingWithEvidence } from "../repositories";
import { makeAgency, makeWebsite, makeScan, resetDatabase } from "../testing/factories";

/**
 * `IssueEvidence` PERSISTENCE — PLAN.md §5.6 (scan-completion transaction),
 * §0.2 P2, §8.6 stage 2.
 *
 * ⚠️ WHY THIS TEST EXISTS. `IssueEvidence` is the anchor every AI citation must
 * resolve to. Phase 3 built the rule engine's `Finding.evidenceRefs` but never
 * persisted them, so the table had no writer at all — 0 rows against a
 * populated `network_requests`. The grounding check would then have rejected
 * every AI output for the right reason and the wrong cause, and the visible
 * symptom would have been "AI never works", not "evidence is missing".
 *
 * Integration, not unit: this asserts what is actually in Postgres after the
 * reconcile transaction commits, which is the only place the claim is real.
 * Needs `docker compose up -d`.
 */

function finding(
  overrides: Partial<FindingWithEvidence> = {},
): FindingWithEvidence {
  return {
    ruleId: "PDM-R001",
    ruleVersion: 1,
    fingerprint: "PDM-R001:site:meta-pixel",
    category: "PRE_CONSENT_TRACKING",
    severity: "CRITICAL",
    confidence: 0.97,
    title: "Marketing tracker detected before consent",
    message: "A marketing tracker was detected before consent was given.",
    technicalReason: "A request was observed under consent state NO_CONSENT.",
    recommendedAction: "Move the tag behind consent, then re-scan to verify.",
    evidence: [
      {
        kind: "NETWORK_REQUEST",
        pageUrl: "https://example.test/",
        consentPhase: "NO_CONSENT",
        observedAtMs: 1842,
        confidence: 0.95,
        payload: {
          method: "GET",
          url: "https://connect.facebook.net/en_US/fbevents.js",
          status: 200,
        },
      },
      {
        kind: "COOKIE",
        pageUrl: "https://example.test/",
        consentPhase: "NO_CONSENT",
        observedAtMs: 0,
        confidence: 0.9,
        payload: { name: "_fbp", domain: ".example.test", maxAgeDays: 90 },
      },
    ],
    ...overrides,
  };
}

describe("upsertFromScan writes IssueEvidence", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("persists the rows a finding was derived from", async () => {
    const agency = await makeAgency();
    const website = await makeWebsite(agency.id);
    const scan = await makeScan(agency.id, website.id);
    const repos = repositoriesFor(agency.id);

    const result = await repos.issues.upsertFromScan({
      websiteId: website.id,
      scanId: scan.id,
      detectedAt: new Date(),
      findings: [finding({ fingerprint: `PDM-R001:${website.id}:meta-pixel` })],
    });

    expect(result.created).toBe(1);

    const rows = await repos.db.issueEvidence.findMany({
      where: { scanId: scan.id },
    });
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.kind).sort()).toEqual(["COOKIE", "NETWORK_REQUEST"]);
    // The rule that produced the finding is stamped on its proof, so an
    // evidence row traces back to the rule version that read it.
    expect(rows[0]?.detectionRuleId).toBe("PDM-R001");
    expect(rows[0]?.detectionRuleVersion).toBe(1);
  });

  it("is idempotent under replay — analysis can be re-run (P6)", async () => {
    const agency = await makeAgency();
    const website = await makeWebsite(agency.id);
    const scan = await makeScan(agency.id, website.id);
    const repos = repositoriesFor(agency.id);

    const params = {
      websiteId: website.id,
      scanId: scan.id,
      detectedAt: new Date(),
      findings: [finding({ fingerprint: `PDM-R001:${website.id}:meta-pixel` })],
    };

    await repos.issues.upsertFromScan(params);
    await repos.issues.upsertFromScan(params);

    // ⚠️ The defect this catches: a blind insert doubles the evidence on every
    // replay, burying the real rows under duplicates in the ≤8 AI selection.
    const rows = await repos.db.issueEvidence.findMany({ where: { scanId: scan.id } });
    expect(rows).toHaveLength(2);
  });

  it("keeps an earlier scan's evidence when a later scan sees the issue again", async () => {
    const agency = await makeAgency();
    const website = await makeWebsite(agency.id);
    const first = await makeScan(agency.id, website.id);
    const second = await makeScan(agency.id, website.id);
    const repos = repositoriesFor(agency.id);
    const fingerprint = `PDM-R001:${website.id}:meta-pixel`;

    await repos.issues.upsertFromScan({
      websiteId: website.id,
      scanId: first.id,
      detectedAt: new Date(),
      findings: [finding({ fingerprint })],
    });
    await repos.issues.upsertFromScan({
      websiteId: website.id,
      scanId: second.id,
      detectedAt: new Date(),
      findings: [finding({ fingerprint })],
    });

    // One issue, two scans' proof. "When did this last actually happen" is
    // answered by the evidence, so the history must survive.
    const issues = await repos.db.issue.findMany({ where: { websiteId: website.id } });
    expect(issues).toHaveLength(1);

    const rows = await repos.db.issueEvidence.findMany({
      where: { issueId: issues[0]!.id },
    });
    expect(rows).toHaveLength(4);
    expect(new Set(rows.map((row) => row.scanId)).size).toBe(2);
  });

  it("still works for a finding with no evidence", async () => {
    // Scan-health rules (R022–R025) are derived from the scan record, not from
    // recorded rows, so they legitimately cite nothing.
    const agency = await makeAgency();
    const website = await makeWebsite(agency.id);
    const scan = await makeScan(agency.id, website.id);
    const repos = repositoriesFor(agency.id);

    const result = await repos.issues.upsertFromScan({
      websiteId: website.id,
      scanId: scan.id,
      detectedAt: new Date(),
      findings: [
        finding({ fingerprint: `PDM-R023:${website.id}:scan`, evidence: [] }),
      ],
    });

    expect(result.created).toBe(1);
    const rows = await repos.db.issueEvidence.findMany({ where: { scanId: scan.id } });
    expect(rows).toHaveLength(0);
  });
});
