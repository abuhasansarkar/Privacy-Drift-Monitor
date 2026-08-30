import { afterAll, describe, expect, it } from "vitest";
import { BrowserPool, withPage } from "../pool";

/**
 * BROWSER POOL — real Chromium, on purpose.
 *
 * AGENTS.md names the acceptance condition for this file: "assert context count
 * returns to zero on a forced-failure scan — leaked Playwright contexts are the
 * most likely way a worker dies in production". A mocked browser cannot prove
 * that, because the leak being guarded against is a real process tree.
 *
 * These are slower than the rest of the suite (a browser launch each). That is
 * the cost of the one test that would actually catch the outage.
 */

const pools: BrowserPool[] = [];
function makePool(options: Partial<ConstructorParameters<typeof BrowserPool>[0]> = {}) {
  const pool = new BrowserPool({ concurrency: 2, ...options });
  pools.push(pool);
  return pool;
}

afterAll(async () => {
  await Promise.all(pools.map((pool) => pool.close(5_000)));
});

describe("BrowserPool", () => {
  it("runs work in a context and returns to zero active contexts", async () => {
    const pool = makePool();
    const title = await withPage(pool, async (page) => {
      await page.setContent("<title>fixture</title><h1>hello</h1>");
      return page.title();
    });

    expect(title).toBe("fixture");
    expect(pool.stats().activeContexts).toBe(0);
  });

  it("releases the context when the work THROWS", async () => {
    const pool = makePool();

    await expect(
      withPage(pool, async () => {
        throw new Error("phase blew up");
      }),
    ).rejects.toThrow("phase blew up");

    // The whole point of the file. A failed scan must not cost a context.
    expect(pool.stats().activeContexts).toBe(0);
  });

  it("releases the permit too, so a failure does not shrink capacity", async () => {
    const pool = makePool({ concurrency: 1 });

    for (let i = 0; i < 3; i++) {
      await expect(
        withPage(pool, async () => {
          throw new Error("boom");
        }),
      ).rejects.toThrow();
    }

    // With a leaked permit at concurrency 1, this would hang instead of running.
    const ok = await withPage(pool, async (page) => {
      await page.setContent("<p>still working</p>");
      return page.textContent("p");
    });
    expect(ok).toBe("still working");
    expect(pool.stats().activeContexts).toBe(0);
  });

  it("keeps consent phases isolated — no cookie crosses a context", async () => {
    const pool = makePool();

    await withPage(pool, async (page, context) => {
      await page.setContent("<p>phase one</p>");
      await context.addCookies([
        { name: "consent", value: "accepted", url: "https://example.test/" },
      ]);
      expect(await context.cookies("https://example.test/")).toHaveLength(1);
    });

    // A second phase must start clean, or Accept-All's cookies would silently
    // contaminate the Reject-All recording (§4.3).
    await withPage(pool, async (_page, context) => {
      expect(await context.cookies("https://example.test/")).toHaveLength(0);
    });
  });

  it("never exceeds its concurrency limit", async () => {
    const pool = makePool({ concurrency: 2 });
    let peak = 0;

    await Promise.all(
      Array.from({ length: 6 }, () =>
        withPage(pool, async (page) => {
          peak = Math.max(peak, pool.stats().activeContexts);
          await page.setContent("<p>work</p>");
        }),
      ),
    );

    expect(peak).toBeLessThanOrEqual(2);
    expect(pool.stats().activeContexts).toBe(0);
  });

  it("recycles the browser once maxUses is reached", async () => {
    const pool = makePool({ concurrency: 1, maxUses: 2 });

    for (let i = 0; i < 5; i++) {
      await withPage(pool, async (page) => page.setContent("<p>x</p>"));
    }

    expect(pool.stats().browserRestarts).toBeGreaterThan(0);
    expect(pool.stats().activeContexts).toBe(0);
  });

  it("refuses new work once closing", async () => {
    const pool = new BrowserPool({ concurrency: 1 });
    await withPage(pool, async (page) => page.setContent("<p>x</p>"));
    await pool.close(5_000);

    await expect(withPage(pool, async () => "never")).rejects.toThrow(
      /shutting down/,
    );
  });
}, 120_000);
