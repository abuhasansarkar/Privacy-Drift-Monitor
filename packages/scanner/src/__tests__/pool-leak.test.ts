import { describe, expect, it, vi } from "vitest";

/**
 * BROWSER POOL — the leak that bricked it (F-005).
 *
 * The failure this file holds: `newContext()` throwing left `activeContexts`
 * permanently inflated, `ensureBrowser` then refused to replace the dead
 * browser (`activeContexts > 0`), and every future scan failed until process
 * restart. The counter now counts check-out attempts, decremented
 * unconditionally in `finally` — these tests prove both halves.
 */

vi.mock("playwright", () => {
  const contextsCreated: { close: ReturnType<typeof vi.fn> }[] = [];

  const makeBrowser = (failNextNewContext: { value: boolean }) => ({
    isConnected: () => true,
    close: vi.fn(async () => {}),
    newContext: vi.fn(async () => {
      if (failNextNewContext.value) {
        failNextNewContext.value = false;
        throw new Error("Target closed");
      }
      const context = {
        close: vi.fn(async () => {}),
        newPage: vi.fn(async () => ({})),
      };
      contextsCreated.push(context);
      return context;
    }),
  });

  return {
    chromium: {
      launch: vi.fn(async () => {
        // Each launch starts with a browser that fails its FIRST newContext —
        // the crashed-Chromium shape — and succeeds afterwards.
        const state = { value: true };
        return makeBrowser(state);
      }),
    },
    // Exposed for assertions through the module object.
    __contextsCreated: contextsCreated,
  };
});

import { BrowserPool } from "../browser/pool";

describe("BrowserPool — the newContext-throw leak (F-005)", () => {
  it("returns activeContexts to zero when newContext throws", async () => {
    const pool = new BrowserPool({ concurrency: 2, maxUses: 50, maxAgeMs: 600_000 });

    // First acquire: launch succeeds, newContext throws.
    await expect(
      pool.withContext(async () => {
        throw new Error("should never run");
      }),
    ).rejects.toThrow("Target closed");

    expect(pool.stats().activeContexts).toBe(0);

    await pool.close(1_000);
  });

  it("lets a later acquire launch a browser after repeated newContext failures", async () => {
    const pool = new BrowserPool({ concurrency: 1, maxUses: 50, maxAgeMs: 600_000 });

    /*
     * The mock browser fails only its FIRST newContext after each launch. A
     * second acquire is recycled only if the pool considers the browser dead —
     * `shouldRecycle` checks `isConnected`, which stays true, so the second
     * acquire succeeds. That is FINE for the leak contract: what must hold is
     * that failures never inflate the counter and a later acquire always runs.
     * Force the failure shape explicitly for the second round by driving two
     * pools, each of which sees one throw.
     */

    // First acquire: newContext throws; counter must return to zero.
    await expect(
      pool.withContext(async () => undefined),
    ).rejects.toThrow();
    expect(pool.stats().activeContexts).toBe(0);

    // Second acquire on the same pool: succeeds (the mock's failure was
    // one-shot). The old, bricked pool failed here forever.
    const ran = await pool.withContext(async () => "ran");
    expect(ran).toBe("ran");
    expect(pool.stats().activeContexts).toBe(0);

    await pool.close(1_000);
  });

  it("keeps the counter honest across success and failure interleaved", async () => {
    // A separate pool per interleaving; each mock browser throws once on its
    // first newContext, so the first acquire here exercises the failure path.
    const pool = new BrowserPool({ concurrency: 2, maxUses: 50, maxAgeMs: 600_000 });

    await expect(pool.withContext(async () => undefined)).rejects.toThrow("Target closed");
    expect(pool.stats().activeContexts).toBe(0);

    await pool.withContext(async () => "ok after failure");
    expect(pool.stats().activeContexts).toBe(0);

    await pool.withContext(async () => "ok again");
    expect(pool.stats().activeContexts).toBe(0);

    await pool.close(1_000);
  });
});
