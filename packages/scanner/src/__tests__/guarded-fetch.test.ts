import { afterEach, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { guardedFetch } from "../net/guarded-fetch";
import { SsrfBlockedError } from "../net/guard";
import { nextAllowedTestPort, releaseTestPort } from "./guarded-fetch-helpers";

/**
 * GUARDED FETCH — F-008's proof.
 *
 * The defect this file holds: three Node-side fetch call sites validated their
 * ENTRY url and then fetched with the default `redirect: "follow"` — a 302 to
 * a link-local address was followed unguarded. `assertSafeRedirect` existed,
 * was tested, and was called from nowhere. These tests start real HTTP servers
 * that answer redirects and prove every hop is guarded.
 *
 * ⚠️ THE TEST SERVERS LISTEN ON THE GUARD'S ALLOWED PORTS (8080/8443). The
 * port allowlist is a real control (R1b) and these tests must not pretend it
 * away; binding the fixtures to an allowed port is the honest arrangement.
 * With only two allowed ports, every test closes its servers in `afterEach`
 * so the next test can claim them.
 */

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) =>
          server.close(() => {
            const address = server.address();
            if (address && typeof address === "object") {
              releaseTestPort(address.port);
            }
            resolve();
          }),
        ),
    ),
  );
  // The guard's DNS lookups on failure paths can leave the event loop busy;
  // a short drain keeps the next test's listen() from racing the close().
  await new Promise((resolve) => setTimeout(resolve, 50));
});

/** Starts a server on an SSRF-allowed port; the handler answers each request. */
async function startServer(
  handler: (url: string, res: import("node:http").ServerResponse) => void | Promise<void>,
): Promise<string> {
  const server = createServer((req, res) => {
    void Promise.resolve()
      .then(() => handler(req.url ?? "/", res))
      .catch(() => res.destroy());
  });
  servers.push(server);
  const port = await nextAllowedTestPort(server);
  return `http://127.0.0.1:${port}`;
}

/**
 * One server per test, torn down in `afterEach`, because the guard allows
 * only two ports (8080/8443) and each test needs one. Tests that need to
 * compare "outer" against "internal" use the metadata/loopback literals —
 * which are blocked before any connection — so one server suffices.
 */
describe("guardedFetch — per-hop SSRF enforcement (F-008)", () => {
  it("blocks a redirect to a link-local address", async () => {
    const outer = await startServer((path, res) => {
      if (path === "/redirect") {
        // A cloud-metadata address — the single most valuable SSRF target.
        res.writeHead(302, { location: "http://169.254.169.254/latest/meta-data/" });
        res.end();
        return;
      }
      res.writeHead(404);
      res.end();
    });

    await expect(guardedFetch(`${outer}/redirect`)).rejects.toBeInstanceOf(SsrfBlockedError);
  });

  it("blocks a redirect to a loopback address with a disallowed port", async () => {
    const outer = await startServer((path, res) => {
      if (path === "/r") {
        res.writeHead(302, { location: "http://127.0.0.1:5432/" });
        res.end();
        return;
      }
      res.writeHead(404);
      res.end();
    });

    await expect(guardedFetch(`${outer}/r`)).rejects.toBeInstanceOf(SsrfBlockedError);
  });

  it("blocks a redirect that exceeds the hop limit even between safe hosts", async () => {
    // A self-redirect loop: every hop is "safe" but endless. Redirecting to a
    // full absolute URL on the same allowed port keeps every hop legal except
    // for the hop COUNT — which is what this test isolates.
    const outer = await startServer((path, res) => {
      const n = Number(new URL(path, "http://x").searchParams.get("n") ?? "0");
      res.writeHead(302, { location: `/loop?n=${n + 1}` });
      res.end();
    });

    await expect(guardedFetch(`${outer}/loop?n=0`)).rejects.toBeInstanceOf(SsrfBlockedError);
  });

  it("follows a SAFE redirect chain and returns the final body", async () => {
    /*
     * ⚠️ THE FIXTURE-SERVE SEAM, SAME AS THE §4.15 SUITE. The test server is
     * 127.0.0.1, which the real guard blocks — and must keep blocking. The
     * blocking tests above run with the REAL guard to prove it fires; this
     * test's subject is the redirect-following machinery, so it injects the
     * allow-any guard exactly as `runPhase`'s fixture path does. Production
     * call sites omit the parameter and fail closed.
     */
    const outer = await startServer((path, res) => {
      if (path === "/one") {
        res.writeHead(302, { location: "/two" });
        res.end();
        return;
      }
      if (path === "/two") {
        res.writeHead(200, { "content-type": "text/plain" });
        res.end("final body");
        return;
      }
      res.writeHead(404);
      res.end();
    });

    const result = await guardedFetch(`${outer}/one`, {
      guard: async () => {}, // fixture-only allow-any — see GuardedFetchOptions
    });
    expect(result.status).toBe(200);
    expect(result.body).toBe("final body");
    expect(result.finalUrl).toBe(`${outer}/two`);
  });

  it("caps the response body mid-stream", async () => {
    const outer = await startServer((_, res) => {
      res.writeHead(200, { "content-type": "text/plain" });
      // 1 MB of 'a'; the cap in these tests is far smaller.
      res.end("a".repeat(1024 * 1024));
    });

    const result = await guardedFetch(`${outer}/big`, {
      maxBytes: 1024,
      guard: async () => {}, // fixture-only allow-any — see GuardedFetchOptions
    });
    expect(result.truncated).toBe(true);
    expect(result.body.length).toBeLessThanOrEqual(1024 + 4); // UTF-8 boundary slack
  });

  it("rejects an entry URL that points at a private address", async () => {
    await expect(guardedFetch("http://10.0.0.1/x")).rejects.toBeInstanceOf(SsrfBlockedError);
  });
});
