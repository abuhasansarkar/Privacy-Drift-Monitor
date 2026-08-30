import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

/**
 * BROWSER POOL — PLAN.md Part IV §4.2, Part VII, Phase 2 task 2.2.
 *
 * ⚠️ THE FAILURE THIS FILE EXISTS TO PREVENT. AGENTS.md is explicit: "a leaked
 * context takes down a worker within hours". A Playwright context holds an OS
 * process tree and a chunk of memory; leak one per scan and the box is out of
 * memory by the afternoon. Every acquire path below is paired with a `finally`
 * that releases, and `withContext()` exists so callers cannot forget.
 *
 * The pool owns three separate concerns, and conflating them is how leaks get
 * written:
 *
 *   1. BROWSER lifecycle — expensive to start, so reused across scans, and
 *      recycled after `maxUses` or `maxAgeMs` because a long-lived Chromium
 *      accumulates memory no matter how carefully contexts are closed.
 *   2. CONTEXT isolation — one per consent phase, never shared. Two phases in
 *      one context would let Accept-All's cookies leak into the Reject-All
 *      recording, which would silently corrupt the evidence the whole product
 *      rests on (§4.3).
 *   3. CONCURRENCY — a semaphore, because Chromium instances are the scarce
 *      resource and an unbounded queue turns a traffic spike into an OOM.
 */

export interface BrowserPoolOptions {
  /** Concurrent contexts permitted across the whole pool. */
  concurrency: number;
  /** Recycle the browser after this many contexts. */
  maxUses: number;
  /** Recycle the browser after this long, regardless of use count. */
  maxAgeMs: number;
  /** Appended to the default UA so sites can identify and allow us (§10.5). */
  userAgentSuffix?: string;
  headless?: boolean;
}

export const DEFAULT_POOL_OPTIONS: BrowserPoolOptions = {
  concurrency: 2,
  maxUses: 50,
  maxAgeMs: 30 * 60 * 1000,
  headless: true,
};

export interface PoolStats {
  /** Contexts currently checked out. MUST return to 0 when the pool is idle. */
  activeContexts: number;
  waiting: number;
  browserUses: number;
  browserAgeMs: number;
  browserRestarts: number;
}

/**
 * A counting semaphore. Written out rather than pulled in as a dependency
 * because the whole thing is fifteen lines and the queue discipline (FIFO, so a
 * scan cannot be starved by later arrivals) is something we want to be able to
 * read.
 */
function createSemaphore(permits: number) {
  let available = permits;
  const queue: Array<() => void> = [];

  return {
    get waiting() {
      return queue.length;
    },
    async acquire(): Promise<void> {
      if (available > 0) {
        available -= 1;
        return;
      }
      await new Promise<void>((resolve) => queue.push(resolve));
    },
    release() {
      const next = queue.shift();
      // Hand the permit straight to the next waiter rather than incrementing
      // and letting them re-race for it.
      if (next) next();
      else available += 1;
    },
  };
}

export class BrowserPool {
  private readonly options: BrowserPoolOptions;
  private readonly semaphore: ReturnType<typeof createSemaphore>;

  private browser: Browser | null = null;
  private browserStartedAt = 0;
  private uses = 0;
  private restarts = 0;
  private activeContexts = 0;
  private closing = false;
  /** Serialises browser start/recycle so two acquires cannot launch two browsers. */
  private lifecycle: Promise<void> = Promise.resolve();

  constructor(options: Partial<BrowserPoolOptions> = {}) {
    this.options = { ...DEFAULT_POOL_OPTIONS, ...options };
    this.semaphore = createSemaphore(this.options.concurrency);
  }

  stats(): PoolStats {
    return {
      activeContexts: this.activeContexts,
      waiting: this.semaphore.waiting,
      browserUses: this.uses,
      browserAgeMs: this.browserStartedAt ? Date.now() - this.browserStartedAt : 0,
      browserRestarts: this.restarts,
    };
  }

  private shouldRecycle(): boolean {
    if (!this.browser || !this.browser.isConnected()) return true;
    if (this.uses >= this.options.maxUses) return true;
    return Date.now() - this.browserStartedAt >= this.options.maxAgeMs;
  }

  /**
   * Returns a live browser, starting or recycling one if needed.
   *
   * ⚠️ Recycling waits for `activeContexts === 0`. Closing a browser out from
   * under a running scan would surface as a confusing mid-phase crash and lose
   * the evidence recorded so far — the age and use limits are hygiene, not
   * emergencies, so they can wait for the current work to drain.
   */
  private async ensureBrowser(): Promise<Browser> {
    // Chain onto the previous lifecycle operation so concurrent callers queue
    // rather than each launching their own Chromium.
    const run = this.lifecycle.then(async () => {
      if (!this.shouldRecycle()) return;
      if (this.browser && this.activeContexts > 0) return;

      if (this.browser) {
        this.restarts += 1;
        // `catch`: a browser that already crashed cannot be closed cleanly, and
        // that must not stop us starting the replacement.
        await this.browser.close().catch(() => {});
        this.browser = null;
      }

      this.browser = await chromium.launch({
        headless: this.options.headless ?? true,
        args: [
          // We drive untrusted third-party sites. Keeping the sandbox ON is the
          // point; these flags only trim features that cost memory and add
          // nothing to what we record.
          "--disable-dev-shm-usage",
          "--disable-background-networking",
          "--disable-extensions",
        ],
      });
      this.browserStartedAt = Date.now();
      this.uses = 0;
    });

    this.lifecycle = run.catch(() => {});
    await run;

    if (!this.browser) throw new Error("browser pool failed to start a browser");
    return this.browser;
  }

  /**
   * Runs `fn` with an isolated context, and closes it no matter what.
   *
   * This is the ONLY public way to get a context. There is deliberately no
   * `acquire()` returning one for the caller to close — that shape is what
   * produces the leak this class exists to prevent.
   */
  async withContext<T>(
    fn: (context: BrowserContext) => Promise<T>,
    contextOptions: Parameters<Browser["newContext"]>[0] = {},
  ): Promise<T> {
    if (this.closing) throw new Error("browser pool is shutting down");

    await this.semaphore.acquire();
    let context: BrowserContext | null = null;

    try {
      const browser = await this.ensureBrowser();
      this.uses += 1;
      this.activeContexts += 1;

      context = await browser.newContext({
        // A fresh context per phase means no cookie, storage or cache state
        // crosses a consent journey (§4.3).
        ignoreHTTPSErrors: false,
        ...contextOptions,
        ...(this.options.userAgentSuffix
          ? { userAgent: await this.userAgent(browser, contextOptions) }
          : {}),
      });

      return await fn(context);
    } finally {
      // Order matters: close the context BEFORE releasing the permit, or a
      // waiter can start while this one's process tree is still alive and the
      // pool overshoots its own concurrency limit.
      if (context) {
        await context.close().catch(() => {});
        this.activeContexts -= 1;
      }
      this.semaphore.release();
    }
  }

  /** Appends our identifier to Chromium's real UA rather than inventing one (§10.5). */
  private async userAgent(
    browser: Browser,
    contextOptions: Parameters<Browser["newContext"]>[0] = {},
  ): Promise<string> {
    if (contextOptions?.userAgent) return contextOptions.userAgent;
    const probe = await browser.newContext();
    try {
      const page = await probe.newPage();
      /*
       * Evaluated as a STRING expression, not a closure. A closure body would
       * be type-checked against this package's libs, and `navigator` only
       * exists once `"dom"` is in `lib` — which would then let someone write
       * `document.querySelector` in Node-side scanner code and have it compile.
       * The expression runs in the browser either way; only the checking differs.
       */
      const base = await page.evaluate<string>("navigator.userAgent");
      return `${base} ${this.options.userAgentSuffix}`;
    } finally {
      await probe.close().catch(() => {});
    }
  }

  /**
   * Graceful shutdown: stop accepting work, let in-flight contexts finish, then
   * close the browser. Called from the worker's SIGTERM handler (§7.2).
   */
  async close(timeoutMs = 30_000): Promise<void> {
    this.closing = true;
    const deadline = Date.now() + timeoutMs;

    while (this.activeContexts > 0 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    if (this.browser) {
      await this.browser.close().catch(() => {});
      this.browser = null;
    }
  }
}

/** Convenience for a single page inside a fresh context. */
export async function withPage<T>(
  pool: BrowserPool,
  fn: (page: Page, context: BrowserContext) => Promise<T>,
  contextOptions: Parameters<Browser["newContext"]>[0] = {},
): Promise<T> {
  return pool.withContext(async (context) => {
    const page = await context.newPage();
    try {
      return await fn(page, context);
    } finally {
      // The context close would take the page with it; closing explicitly keeps
      // the teardown order the same whether or not the context is reused later.
      await page.close().catch(() => {});
    }
  }, contextOptions);
}
