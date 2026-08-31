/**
 * PHASE 5 END-TO-END SMOKE — PLAN.md Part VIII §8.2, §8.9.
 *
 * Runs the REAL `ai` job path against real Postgres and real Redis, with
 * `AI_PROVIDER=mock` standing in for the provider:
 *
 *   AI_PROVIDER=mock AI_API_KEY=x AI_ENABLED=true npx tsx worker/src/ai.smoke.ts
 *
 * ⚠️ IT EXISTS BECAUSE THE UNIT TESTS CANNOT MAKE THIS CHECK. They exercise
 * `runAI` against in-memory ports, which proves the SEQUENCE is right and
 * proves nothing about whether the ports work. Running it found a real defect
 * the whole suite was green through: `resolveProvider("mock")` built a
 * `MockProvider` that cited no evidence, so every local generation failed
 * validation and looked exactly like a broken validator. AGENTS.md's rule —
 * "do not describe something as working on the strength of the code existing"
 * — is what this file is for.
 *
 * It seeds an agency, exercises the job twice, prints the `AIRequest` rows,
 * checks BOTH model tiers against the live provider, and deletes everything it
 * made.
 *
 * ⚠️ RUN IT AFTER CHANGING `AI_MODEL_STANDARD` OR `AI_MODEL_ADVANCED`. Model ids
 * are matched exactly and a wrong one is a PERMANENT 400 that is never retried,
 * so it presents as "AI is broken", not as "that id is wrong". Verified
 * failures: a trailing space, and the wrong case (`GPT-4o-mini`) — both 400
 * `model_not_found`.
 */
import { randomUUID } from "node:crypto";
import { prisma } from "@pdm/database";
import { repositoriesFor } from "@pdm/database/repositories";
import {
  OpenAIProvider,
  loadAIConfig,
  microCentsToUsd,
  runFeature,
} from "@pdm/ai";
import {
  makeAgency,
  makeClient,
  makeScan,
  makeWebsite,
} from "@pdm/database/testing";
import { buildContext, closeAiRedis, processAiJob } from "./jobs/ai.job";

async function main() {
  const suffix = randomUUID().slice(0, 8);

  const agency = await makeAgency({ name: `AI Smoke ${suffix}` });
  const client = await makeClient(agency.id);
  const website = await makeWebsite(agency.id, { clientId: client.id });
  const scan = await makeScan(agency.id, website.id, {
    detectedCmpName: "Complianz",
  });

  const issue = await prisma.issue.create({
    data: {
      agencyId: agency.id,
      websiteId: website.id,
      firstScanId: scan.id,
      lastScanId: scan.id,
      ruleId: "PDM-R001",
      ruleVersion: 1,
      fingerprint: `PDM-R001:${website.id}:meta-pixel`,
      category: "PRE_CONSENT_TRACKING",
      severity: "CRITICAL",
      status: "NEW",
      confidence: 0.97,
      title: "Marketing tracker detected before consent",
      message: "A marketing tracker was detected before consent was given.",
      technicalReason: "A request was observed under consent state NO_CONSENT.",
      recommendedAction: "Move the tag behind consent, then re-scan to verify.",
      firstDetectedAt: new Date(),
      lastSeenAt: new Date(),
    },
  });

  const evidence = await prisma.issueEvidence.createManyAndReturn({
    data: [
      {
        issueId: issue.id,
        scanId: scan.id,
        agencyId: agency.id,
        kind: "NETWORK_REQUEST",
        pageUrl: "https://example.test/",
        consentPhase: "NO_CONSENT",
        observedAtMs: 1842,
        detectionRuleId: "PDM-R001",
        detectionRuleVersion: 1,
        confidence: 0.97,
        payload: {
          method: "GET",
          url: "https://connect.facebook.net/en_US/fbevents.js",
          status: 200,
        },
      },
      {
        issueId: issue.id,
        scanId: scan.id,
        agencyId: agency.id,
        kind: "COOKIE",
        pageUrl: "https://example.test/",
        consentPhase: "NO_CONSENT",
        observedAtMs: 0,
        detectionRuleId: "PDM-R001",
        detectionRuleVersion: 1,
        confidence: 0.9,
        payload: { name: "_fbp", domain: ".example.test", maxAgeDays: 90 },
      },
    ],
  });

  console.log(`seeded agency=${agency.id} issue=${issue.id} evidence=${evidence.length}`);

  const job = {
    agencyId: agency.id,
    feature: "EXPLAIN_ISSUE" as const,
    entityType: "issue",
    entityId: issue.id,
    issueId: issue.id,
    userId: null,
    dedupeKey: `${agency.id}:EXPLAIN_ISSUE:${issue.id}`,
  };

  console.log("\n── call 1 (expect: generated) ──────────────────────────────");
  const first = await processAiJob(job);
  console.log(first);

  console.log("\n── call 2 (expect: cached, zero cost) ──────────────────────");
  const second = await processAiJob(job);
  console.log(second);

  const repos = repositoriesFor(agency.id);
  const rows = await prisma.aIRequest.findMany({
    where: { agencyId: agency.id },
    orderBy: { createdAt: "asc" },
  });

  console.log("\n── AIRequest rows ──────────────────────────────────────────");
  for (const row of rows) {
    console.log({
      status: row.status,
      promptVersion: row.promptVersion,
      creditsCharged: row.creditsCharged,
      fromCache: row.fromCache,
      model: row.model,
      inputHash: row.inputHash.slice(0, 12),
    });
  }

  const generated = rows.find((r) => r.status === "SUCCESS");
  console.log("\n── the generated output ────────────────────────────────────");
  console.dir(generated?.output, { depth: 4 });
  console.log(
    `tokens: in=${generated?.promptTokens} out=${generated?.completionTokens} ` +
      `cost=${generated?.costMicroCents} microcents  latency=${generated?.latencyMs}ms`,
  );

  const credits = await repos.ai.creditsUsedSince(new Date(Date.now() - 86_400_000));
  console.log(`\ncredits charged this period: ${credits} (expect 1 — the cache hit is free)`);

  const stored = rows.find((r) => r.status === "SUCCESS");
  const output = stored?.output as { evidence_refs?: string[] } | null;
  const realIds = new Set(evidence.map((e) => e.id));
  const allResolve = (output?.evidence_refs ?? []).every((ref) => realIds.has(ref));
  console.log(
    `grounding: cited ${output?.evidence_refs?.length ?? 0} refs, all resolve to real IssueEvidence ids: ${allResolve}`,
  );

  /*
   * ⚠️ BOTH TIERS, AGAINST THE LIVE PROVIDER. The advanced tier is unreachable
   * from any MVP feature (`FEATURE_TIER` maps only the two V1.5 features to
   * it), so nothing else in this script or the test suite would ever call it —
   * and a broken advanced model id would sit undiscovered until V1.5 shipped.
   *
   * It also exercises the reasoning path. Measured: `gpt-5-nano` at our
   * 400-token cap WITHOUT `reasoning.effort` spent all 384 output tokens on
   * reasoning and returned nothing (`status: incomplete`); with `minimal` it
   * returns a complete answer in ~222.
   */
  console.log("\n── both tiers against the live provider ────────────────────");
  const config = loadAIConfig();
  const context = await buildContext(job);
  if (!context) throw new Error("could not rebuild the context for the tier probe");
  for (const tier of ["standard", "advanced"] as const) {
    const probe = await runFeature(
      new OpenAIProvider({
        apiKey: config.apiKey!,
        baseUrl: config.baseUrl,
        models: config.models,
        reasoningEffort: config.reasoningEffort,
      }),
      "EXPLAIN_ISSUE",
      context,
      { tier, maxOutputTokens: 400, timeoutMs: 60_000, traceId: `tier-${tier}` },
    );
    console.log(
      `${tier.padEnd(9)} ${config.models[tier].padEnd(14)} ok=${probe.ok} ` +
        `model=${probe.model} cost=${probe.usage.costMicroCents}mc ` +
        `($${microCentsToUsd(probe.usage.costMicroCents).toFixed(6)}) ` +
        `${probe.ok ? "" : "→ " + probe.errorMessage}`,
    );
  }

  console.log("\n── cleanup ────────────────────────────────────────────────");
  await prisma.agency.delete({ where: { id: agency.id } });
  await closeAiRedis();
  await prisma.$disconnect();
  console.log("done");
}

main().catch(async (error) => {
  console.error(error);
  await closeAiRedis();
  await prisma.$disconnect();
  process.exit(1);
});
