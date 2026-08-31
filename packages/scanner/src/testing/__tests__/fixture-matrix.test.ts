import { describe, expect, it } from "vitest";
import { FIXTURES, PLAN_FIXTURE_IDS, startFixture } from "../fixture-server";

/**
 * THE §4.15 CI CONTRACT, asserted.
 *
 * "F01–F30 run on every PR that touches `packages/scanner`. F28 is a hard gate
 * — any change producing spurious drift fails the build."
 *
 * ⚠️ THIS FILE EXISTS BECAUSE THE NUMBERS ARE A CONTRACT. An earlier pass
 * numbered a local set F01–F12 describing entirely different behaviours, so
 * "F07 passes" said nothing about shadow-DOM consent. These assertions make
 * that class of drift a build failure rather than a discovery.
 *
 * ⚠️ NO BROWSER HERE. This suite checks the matrix's SHAPE and the server's
 * behaviour; the pages themselves are driven by `phase-runner.test.ts` and
 * `scan.test.ts`, which pay for Chromium.
 */

async function fetchText(url: string): Promise<{ status: number; body: string }> {
  const response = await fetch(url);
  return { status: response.status, body: await response.text() };
}

describe("§4.15 fixture matrix", () => {
  it("defines every one of the thirty planned fixtures", () => {
    const missing = PLAN_FIXTURE_IDS.filter((id) => !(id in FIXTURES));
    expect(missing, `missing plan fixtures: ${missing.join(", ")}`).toEqual([]);
  });

  it("gives each fixture an id matching its key and a description", () => {
    for (const [key, fixture] of Object.entries(FIXTURES)) {
      expect(fixture.id, `${key} has a mismatched id`).toBe(key);
      expect(fixture.describes.length, `${key} has no description`).toBeGreaterThan(10);
    }
  });

  it("keeps our own fixtures out of the plan's numbering", () => {
    // An X-numbered fixture is ours. If one ever collides with an F number,
    // a plan row has silently been replaced by something else.
    const ours = Object.keys(FIXTURES).filter((id) => id.startsWith("X"));
    expect(ours.length).toBeGreaterThan(0);
    for (const id of ours) expect(PLAN_FIXTURE_IDS).not.toContain(id);
  });

  it("describes each plan fixture distinctly", () => {
    const described = PLAN_FIXTURE_IDS.map((id) => FIXTURES[id]?.describes);
    expect(new Set(described).size).toBe(PLAN_FIXTURE_IDS.length);
  });
});

describe("fixture server behaviour", () => {
  it("F24 returns 500 on the document", async () => {
    const server = await startFixture("F24");
    try {
      const { status } = await fetchText(server.origin);
      expect(status).toBe(500);
    } finally {
      await server.close();
    }
  });

  it("F30 serves a robots.txt that disallows our user agent", async () => {
    const server = await startFixture("F30");
    try {
      const { status, body } = await fetchText(`${server.origin}/robots.txt`);
      expect(status).toBe(200);
      expect(body).toContain("PrivacyDriftMonitor");
      expect(body).toContain("Disallow: /");
    } finally {
      await server.close();
    }
  });

  it("serves no robots.txt for fixtures that do not define one", async () => {
    const server = await startFixture("F01");
    try {
      // A 404 rather than a hang: a scanner that fetches robots.txt on every
      // target must get a definite answer for the other 29 fixtures.
      const { status } = await fetchText(`${server.origin}/robots.txt`);
      expect(status).toBe(404);
    } finally {
      await server.close();
    }
  });

  it("F23's stall is overridable, so a timeout test need not wait 20 seconds", async () => {
    // The fixture's own value matches §4.15; the override is what keeps CI fast.
    expect(FIXTURES.F23?.documentDelayMs).toBe(20_000);

    const server = await startFixture("F23", { documentDelayMs: 50 });
    try {
      const started = Date.now();
      const { status } = await fetchText(server.origin);
      expect(status).toBe(200);
      expect(Date.now() - started).toBeLessThan(5_000);
    } finally {
      await server.close();
    }
  });

  it("F19 answers a client-routed path with the same document", async () => {
    const server = await startFixture("F19");
    try {
      const { status, body } = await fetchText(`${server.origin}/about`);
      expect(status).toBe(200);
      expect(body).toContain("SPA");
    } finally {
      await server.close();
    }
  });
});

/**
 * ⚠️ THE F28 HARD GATE, at the source.
 *
 * §4.15: "Identical site scanned twice → ZERO drift events — the single most
 * important regression test." Drift is computed from fingerprints, fingerprints
 * are computed from what was recorded, and what was recorded comes from the
 * page. So the first thing that must hold is that the PAGE is byte-identical
 * between loads — if the fixture itself varies, a green drift test would only
 * be proving the normaliser papers over the variation.
 *
 * The end-to-end assertion (scan twice, diff, expect nothing) lives with the
 * drift engine, which owns the comparison.
 */
describe("F28 — the drift hard gate", () => {
  it("serves byte-identical HTML on every load", async () => {
    const server = await startFixture("F28");
    try {
      const first = await fetchText(server.origin);
      const second = await fetchText(server.origin);
      const third = await fetchText(server.origin);
      expect(first.body).toBe(second.body);
      expect(second.body).toBe(third.body);
    } finally {
      await server.close();
    }
  });

  it("carries no timestamp, random value or cache-buster", () => {
    const html = FIXTURES.F28?.html ?? "";
    for (const forbidden of ["Math.random", "Date.now", "new Date", "?t=", "?v="]) {
      expect(html.includes(forbidden), `F28 contains "${forbidden}"`).toBe(false);
    }
  });

  it("contrasts with F26 and F27, which vary on purpose", () => {
    // If these ever stop varying, the normalisation tests they back become
    // vacuous — they would pass because there was nothing to normalise.
    expect(FIXTURES.F26?.html).toContain("Math.random");
    expect(FIXTURES.F27?.html).toContain("Math.random");
  });
});
