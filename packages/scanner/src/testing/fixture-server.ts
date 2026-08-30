import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

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
 */

export interface Fixture {
  /** F-number from the plan's fixture matrix, for traceability. */
  id: string;
  /** What behaviour this page exists to exercise. */
  describes: string;
  html: string;
  /** Extra routes this fixture serves — scripts, beacons, images. */
  routes?: Record<string, { body: string; contentType: string; status?: number }>;
}

const page = (body: string, head = "") =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>fixture</title>${head}</head><body>${body}</body></html>`;

/**
 * F01–F12. Deliberately small: a fixture that renders a realistic marketing
 * page would make a failure hard to attribute.
 */
export const FIXTURES: Record<string, Fixture> = {
  /* ── Baseline ───────────────────────────────────────────────────────── */
  F01: {
    id: "F01",
    describes: "Static page, no trackers, no banner — the clean baseline",
    html: page("<h1>Quiet page</h1><p>Nothing loads here.</p>"),
  },

  F02: {
    id: "F02",
    describes: "First-party subresource only — must NOT count as third-party",
    html: page(
      "<h1>First party</h1>",
      `<script src="/assets/app.js"></script>`,
    ),
    routes: {
      "/assets/app.js": { body: "window.__app = 1;", contentType: "application/javascript" },
    },
  },

  /* ── Trackers before consent ────────────────────────────────────────── */
  F03: {
    id: "F03",
    describes: "Third-party script fires immediately, before any consent",
    html: page(
      "<h1>Pre-consent tracker</h1>",
      `<script src="__THIRD_PARTY__/tracker.js"></script>`,
    ),
  },

  F04: {
    id: "F04",
    describes: "Cookie written by script before consent",
    html: page(
      "<h1>Pre-consent cookie</h1>",
      `<script>document.cookie = "_ga=GA1.2.999; path=/";</script>`,
    ),
  },

  F05: {
    id: "F05",
    describes: "localStorage and sessionStorage written before consent",
    html: page(
      "<h1>Pre-consent storage</h1>",
      `<script>
        localStorage.setItem("_fbp", "fb.1.1700000000.123456789");
        localStorage.setItem("theme", "dark");
        sessionStorage.setItem("sid", "abc123");
      </script>`,
    ),
  },

  /* ── Deferred / late-firing ─────────────────────────────────────────── */
  F06: {
    id: "F06",
    describes: "Tracker fires 1.2s after load — caught only by the observation window",
    html: page(
      "<h1>Late tracker</h1>",
      `<script>
        setTimeout(function () {
          var s = document.createElement("script");
          s.src = "__THIRD_PARTY__/late.js";
          document.head.appendChild(s);
        }, 1200);
      </script>`,
    ),
  },

  F07: {
    id: "F07",
    describes: "Tracker fires only after a scroll — the scroll step must trigger it",
    html: page(
      `<h1>Scroll tracker</h1><div style="height:4000px"></div>`,
      `<script>
        var fired = false;
        addEventListener("scroll", function () {
          if (fired) return;
          fired = true;
          var i = new Image();
          i.src = "__THIRD_PARTY__/pixel.gif";
        });
      </script>`,
    ),
  },

  /* ── Consent banners ────────────────────────────────────────────────── */
  F08: {
    id: "F08",
    describes: "Generic banner, Accept and Reject buttons, tracker gated on accept",
    html: page(
      `<h1>Generic banner</h1>
       <div id="cookie-banner" role="dialog" aria-label="Cookie consent">
         <p>We use cookies.</p>
         <button id="accept">Accept all</button>
         <button id="reject">Reject all</button>
       </div>`,
      `<script>
        function load() {
          var s = document.createElement("script");
          s.src = "__THIRD_PARTY__/tracker.js";
          document.head.appendChild(s);
        }
        document.addEventListener("DOMContentLoaded", function () {
          document.getElementById("accept").addEventListener("click", function () {
            document.cookie = "consent=accepted; path=/";
            document.getElementById("cookie-banner").remove();
            load();
          });
          document.getElementById("reject").addEventListener("click", function () {
            document.cookie = "consent=rejected; path=/";
            document.getElementById("cookie-banner").remove();
          });
        });
      </script>`,
    ),
  },

  F09: {
    id: "F09",
    describes: "Banner inside a closed-ish shadow root — the Usercentrics shape",
    html: page(
      `<h1>Shadow banner</h1><div id="host"></div>`,
      `<script>
        document.addEventListener("DOMContentLoaded", function () {
          var root = document.getElementById("host").attachShadow({ mode: "open" });
          root.innerHTML =
            '<div role="dialog" aria-label="Consent">' +
            '<button id="s-accept">Accept all</button>' +
            '<button id="s-reject">Reject all</button></div>';
          root.getElementById("s-reject").addEventListener("click", function () {
            document.cookie = "consent=rejected; path=/";
            document.getElementById("host").remove();
          });
        });
      </script>`,
    ),
  },

  F10: {
    id: "F10",
    describes: "Banner with NO reject control — reject must be UNDETERMINED, not passed",
    html: page(
      `<h1>Accept-only banner</h1>
       <div id="cookie-banner" role="dialog"><button id="accept">Got it</button></div>`,
    ),
  },

  /* ── Failure shapes ─────────────────────────────────────────────────── */
  F11: {
    id: "F11",
    describes: "Server returns 500 — a transient scan failure",
    html: "",
  },

  F12: {
    id: "F12",
    describes: "Page never settles — an endless polling request",
    html: page(
      "<h1>Never settles</h1>",
      `<script>setInterval(function () { fetch("/poll"); }, 150);</script>`,
    ),
  },
};

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

function handler(fixtureId: string, thirdPartyOrigin: () => string) {
  return (req: IncomingMessage, res: ServerResponse) => {
    const fixture = FIXTURES[fixtureId];
    if (!fixture) return respond(res, 404, "text/plain", "unknown fixture");

    const url = new URL(req.url ?? "/", "http://127.0.0.1");

    if (fixture.id === "F11" && url.pathname === "/") {
      return respond(res, 500, "text/plain", "fixture failure");
    }

    if (url.pathname === "/") {
      // `__THIRD_PARTY__` is substituted at serve time because the port is only
      // known once the server is listening.
      return respond(
        res,
        200,
        "text/html; charset=utf-8",
        fixture.html.replaceAll("__THIRD_PARTY__", thirdPartyOrigin()),
      );
    }

    const route = fixture.routes?.[url.pathname];
    if (route) {
      return respond(res, route.status ?? 200, route.contentType, route.body);
    }

    if (url.pathname === "/poll") return respond(res, 200, "application/json", "{}");

    respond(res, 404, "text/plain", "not found");
  };
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
export async function startFixture(fixtureId: keyof typeof FIXTURES): Promise<FixtureServer> {
  const thirdParty = createServer(thirdPartyHandler);
  const thirdPartyPort = await listen(thirdParty);
  const thirdPartyOrigin = `http://127.0.0.1:${thirdPartyPort}`;

  const main = createServer(handler(fixtureId, () => thirdPartyOrigin));
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
