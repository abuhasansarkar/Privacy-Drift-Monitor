import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { FIXTURES, type Fixture } from "./fixtures";

/**
 * FIXTURE SERVER — PLAN.md Part XII, Phase 2 task 2.14.
 *
 * ⚠️ WHY THIS EXISTS AND WHY IT COMES FIRST. The plan numbers this 2.14, but
 * every task from 2.3 onward is untestable without it. Developing recorders and
 * consent adapters against live third-party sites gives you tests that are slow,
 * flaky, and that break when someone else redeploys — which is the same as
 * having no tests on the one subsystem the whole product's credibility rests on.
 *
 * Each fixture is a deliberately minimal page that exercises ONE behaviour we
 * claim to detect. They are served from 127.0.0.1 on an ephemeral port.
 *
 * ⚠️ THE SSRF GUARD BLOCKS 127.0.0.1 — as it must (§10.3). Tests that drive the
 * scanner against these fixtures therefore call the browser layer directly and
 * do NOT go through the guard. That is not a hole: it is the reason the guard's
 * own test suite uses its own vectors rather than these pages, and the two must
 * never be merged into one "just scan it" helper.
 *
 * The PAGES live in `./fixtures.ts`; this file only serves them. The split
 * keeps the §4.15 matrix readable as a matrix rather than buried in HTTP
 * plumbing.
 */

export type { Fixture };
export { FIXTURES, PLAN_FIXTURE_IDS } from "./fixtures";

export interface FixtureServer {
  /** Origin of the page under test, e.g. http://127.0.0.1:53124 */
  origin: string;
  /**
   * A DIFFERENT origin on the same host, used for third-party subresources.
   * Third-party classification is by registrable domain, and 127.0.0.1 has
   * none — so tests assert on the recorded host rather than on `isThirdParty`.
   */
  thirdPartyOrigin: string;
  close(): Promise<void>;
}

function respond(res: ServerResponse, status: number, contentType: string, body: string) {
  res.writeHead(status, {
    "content-type": contentType,
    // No caching, or a second scan in the same test run gets a 304 and records
    // nothing — which would look exactly like "the tracker stopped firing".
    "cache-control": "no-store",
  });
  res.end(body);
}

function handler(
  fixtureId: string,
  thirdPartyOrigin: () => string,
  overrides: FixtureOverrides,
) {
  return (req: IncomingMessage, res: ServerResponse) => {
    const fixture = FIXTURES[fixtureId];
    if (!fixture) return respond(res, 404, "text/plain", "unknown fixture");

    const url = new URL(req.url ?? "/", "http://127.0.0.1");

    // F30 disallows our user agent here. Served for every fixture so a scanner
    // that fetches robots.txt gets a 404 rather than a hang on the other 29.
    if (url.pathname === "/robots.txt") {
      return fixture.robotsTxt
        ? respond(res, 200, "text/plain", fixture.robotsTxt)
        : respond(res, 404, "text/plain", "not found");
    }

    if (url.pathname === "/") {
      const status = fixture.documentStatus ?? 200;
      if (status !== 200) {
        return respond(res, status, "text/plain", "fixture failure");
      }

      // `__THIRD_PARTY__` is substituted at serve time because the port is only
      // known once the server is listening.
      const body = fixture.html.replaceAll("__THIRD_PARTY__", thirdPartyOrigin());

      const delay = overrides.documentDelayMs ?? fixture.documentDelayMs ?? 0;
      if (delay > 0) {
        // F23's slow first byte. The timer is unref'd so a test that gives up
        // and closes the server is not held open by a pending response.
        const timer = setTimeout(
          () => respond(res, 200, "text/html; charset=utf-8", body),
          delay,
        );
        timer.unref?.();
        return;
      }

      return respond(res, 200, "text/html; charset=utf-8", body);
    }

    const route = fixture.routes?.[url.pathname];
    if (route) {
      return respond(res, route.status ?? 200, route.contentType, route.body);
    }

    if (url.pathname === "/poll") return respond(res, 200, "application/json", "{}");

    // A client-routed SPA (F19) navigates to a path the server never rendered.
    // Answering 200 with the same document is what a real SPA host does.
    if (fixture.id === "F19") {
      return respond(
        res,
        200,
        "text/html; charset=utf-8",
        fixture.html.replaceAll("__THIRD_PARTY__", thirdPartyOrigin()),
      );
    }

    respond(res, 404, "text/plain", "not found");
  };
}

export interface FixtureOverrides {
  /**
   * Shortens F23's 20-second stall.
   *
   * ⚠️ The fixture's own value matches §4.15. A test asserting timeout HANDLING
   * does not need to wait 20 seconds to prove it, and one that hard-coded a
   * shorter fixture would stop matching the plan.
   */
  documentDelayMs?: number;
}

/** Third-party origin: serves the scripts and pixels the fixtures pull in. */
function thirdPartyHandler(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  if (url.pathname.endsWith(".gif")) {
    res.writeHead(200, { "content-type": "image/gif", "cache-control": "no-store" });
    // 1×1 transparent GIF — the classic tracking pixel.
    return res.end(
      Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64"),
    );
  }
  respond(
    res,
    200,
    "application/javascript",
    // Sets a cookie the way a real tag would, so cookie recording has something
    // third-party-shaped to find.
    `document.cookie = "_tracker=1; path=/"; window.__tracked = true;`,
  );
}

async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return (server.address() as AddressInfo).port;
}

/** Starts a fixture on its own ephemeral port, plus its third-party origin. */
export async function startFixture(
  fixtureId: keyof typeof FIXTURES,
  overrides: FixtureOverrides = {},
): Promise<FixtureServer> {
  const thirdParty = createServer(thirdPartyHandler);
  const thirdPartyPort = await listen(thirdParty);
  const thirdPartyOrigin = `http://127.0.0.1:${thirdPartyPort}`;

  const main = createServer(handler(fixtureId, () => thirdPartyOrigin, overrides));
  const mainPort = await listen(main);

  return {
    origin: `http://127.0.0.1:${mainPort}`,
    thirdPartyOrigin,
    async close() {
      await Promise.all(
        [main, thirdParty].map(
          (server) => new Promise<void>((resolve) => server.close(() => resolve())),
        ),
      );
    },
  };
}
