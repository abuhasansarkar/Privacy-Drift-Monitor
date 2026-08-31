/**
 * FIXTURE PAGES — PLAN.md Part IV §4.15, Phase 2 task 2.14.
 *
 * ⚠️ THE F-NUMBERS ARE A CONTRACT, NOT LABELS. §4.15 fixes a 30-row matrix and
 * the CI contract names it directly: "F01–F30 run on every PR that touches
 * `packages/scanner`. F28 is a hard gate." An earlier pass numbered a local set
 * F01–F12 that described different behaviours, which would have made a green
 * "F28 passes" mean nothing. The ids below match the plan row for row.
 *
 * ⚠️ `X`-PREFIXED FIXTURES ARE OURS, NOT THE PLAN'S. They cover behaviours the
 * matrix does not name but that the recorders genuinely need — a first-party
 * subresource that must NOT be classified third-party, a banner with no reject
 * control at all. Kept separate so nobody mistakes one for a plan row.
 *
 * ⚠️ VENDOR CLASSIFICATION IS NOT ASSERTED HERE. The classifier matches on
 * registrable domain (`google-analytics.com`), and these pages are served from
 * 127.0.0.1, which has none. Fixtures assert what the BROWSER recorded — the
 * request happened, under this consent phase, from this host. Vendor matching
 * is unit-tested against synthetic requests in `packages/analysis`. Merging the
 * two would need a DNS-rewriting proxy for no extra confidence.
 */

export interface Fixture {
  /** F-number from §4.15's matrix, or an X-number for one of ours. */
  id: string;
  /** What behaviour this page exists to exercise. */
  describes: string;
  html: string;
  /** Extra routes this fixture serves — scripts, beacons, images. */
  routes?: Record<string, { body: string; contentType: string; status?: number }>;
  /** Status for the document response. F24 uses this. */
  documentStatus?: number;
  /** Milliseconds to stall the document response by. F23 uses this. */
  documentDelayMs?: number;
  /** Served at /robots.txt. F30 uses this. */
  robotsTxt?: string;
}

const page = (body: string, head = "") =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>fixture</title>${head}</head><body>${body}</body></html>`;

/** Injects a third-party script tag after `delay` ms. */
const deferredScript = (path: string, delay: number) => `<script>
  setTimeout(function () {
    var s = document.createElement("script");
    s.src = "__THIRD_PARTY__${path}";
    document.head.appendChild(s);
  }, ${delay});
</script>`;

/**
 * A banner that gates a tracker behind Accept, with configurable controls.
 *
 * Shared by the five CMP fixtures because the CMP-specific part is the SELECTOR
 * and the API surface, not the gating logic — writing five near-identical
 * scripts would hide that.
 */
function bannerPage(options: {
  heading: string;
  /** Markup for the banner itself. Must include the accept/reject controls. */
  banner: string;
  acceptSelector: string;
  rejectSelector: string;
  /** Optional global the adapter's API path looks for. */
  api?: string;
  /** A control that reopens preferences, for the withdrawal phase. */
  withdrawSelector?: string;
}): string {
  return page(
    `<h1>${options.heading}</h1>${options.banner}`,
    `<script>
      ${options.api ?? ""}
      function pdmLoadTracker() {
        var s = document.createElement("script");
        s.src = "__THIRD_PARTY__/tracker.js";
        document.head.appendChild(s);
      }
      document.addEventListener("DOMContentLoaded", function () {
        var accept = document.querySelector(${JSON.stringify(options.acceptSelector)});
        var reject = document.querySelector(${JSON.stringify(options.rejectSelector)});
        var banner = document.querySelector("[data-pdm-banner]");
        if (accept) accept.addEventListener("click", function () {
          document.cookie = "consent=accepted; path=/";
          if (banner) banner.remove();
          pdmLoadTracker();
        });
        if (reject) reject.addEventListener("click", function () {
          document.cookie = "consent=rejected; path=/";
          if (banner) banner.remove();
        });
        ${
          options.withdrawSelector
            ? `var withdraw = document.querySelector(${JSON.stringify(options.withdrawSelector)});
               if (withdraw) withdraw.addEventListener("click", function () {
                 document.cookie = "consent=rejected; path=/";
               });`
            : ""
        }
      });
    </script>`,
  );
}

export const FIXTURES: Record<string, Fixture> = {
  /* ── Baseline (§4.15 F01–F02) ───────────────────────────────────────── */

  F01: {
    id: "F01",
    describes: "No CMP, no trackers — the clean baseline. Score 100, no findings",
    html: page("<h1>Quiet page</h1><p>Nothing loads here.</p>"),
  },

  F02: {
    id: "F02",
    describes: "No CMP, two analytics tags firing immediately — both must be recorded",
    html: page(
      "<h1>Untamed tags</h1>",
      `<script src="__THIRD_PARTY__/gtag/js?id=G-TEST"></script>
       <script>
         var pixel = new Image();
         pixel.src = "__THIRD_PARTY__/tr?id=999&ev=PageView";
       </script>`,
    ),
  },

  /* ── The five known CMPs (§4.15 F03–F07) ────────────────────────────── */

  F03: {
    id: "F03",
    describes: "CookieYes banner, correct gating — all four phases execute",
    html: bannerPage({
      heading: "CookieYes",
      banner: `<div data-pdm-banner class="cky-consent-container" role="dialog" aria-label="Cookie consent">
        <p>We use cookies.</p>
        <button class="cky-btn-accept">Accept All</button>
        <button class="cky-btn-reject">Reject All</button>
        <button class="cky-btn-customize">Customize</button>
      </div>`,
      acceptSelector: ".cky-btn-accept",
      rejectSelector: ".cky-btn-reject",
      withdrawSelector: ".cky-btn-customize",
    }),
  },

  F04: {
    id: "F04",
    describes: "Cookiebot banner — the adapter's API path (`Cookiebot.submitCustomConsent`)",
    html: bannerPage({
      heading: "Cookiebot",
      banner: `<div data-pdm-banner id="CybotCookiebotDialog" role="dialog" aria-label="Cookie consent">
        <button id="CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll">Allow all</button>
        <button id="CybotCookiebotDialogBodyButtonDecline">Decline</button>
      </div>`,
      acceptSelector: "#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll",
      rejectSelector: "#CybotCookiebotDialogBodyButtonDecline",
      api: `window.Cookiebot = {
        consented: false,
        submitCustomConsent: function () {
          document.cookie = "CookieConsent={stamp:'x'}; path=/";
          var banner = document.querySelector("[data-pdm-banner]");
          if (banner) banner.remove();
        },
        withdraw: function () { document.cookie = "CookieConsent=; path=/"; }
      };`,
    }),
  },

  F05: {
    id: "F05",
    describes: "Complianz banner, correct gating",
    html: bannerPage({
      heading: "Complianz",
      banner: `<div data-pdm-banner id="cmplz-cookiebanner-container" role="dialog" aria-label="Cookie consent">
        <button class="cmplz-accept">Accept</button>
        <button class="cmplz-deny">Deny</button>
      </div>`,
      acceptSelector: ".cmplz-accept",
      rejectSelector: ".cmplz-deny",
    }),
  },

  F06: {
    id: "F06",
    describes: "OneTrust banner — reject via #onetrust-reject-all-handler",
    html: bannerPage({
      heading: "OneTrust",
      banner: `<div data-pdm-banner id="onetrust-banner-sdk" role="dialog" aria-label="Cookie consent">
        <button id="onetrust-accept-btn-handler">Accept All Cookies</button>
        <button id="onetrust-reject-all-handler">Reject All</button>
      </div>`,
      acceptSelector: "#onetrust-accept-btn-handler",
      rejectSelector: "#onetrust-reject-all-handler",
    }),
  },

  F07: {
    id: "F07",
    describes: "Usercentrics inside a SHADOW ROOT — shadow-piercing plus the UC_UI API",
    html: page(
      `<h1>Usercentrics</h1><div id="usercentrics-root"></div>`,
      `<script>
        window.UC_UI = {
          isInitialized: function () { return true; },
          acceptAllConsents: function () { document.cookie = "uc=accepted; path=/"; },
          denyAllConsents: function () { document.cookie = "uc=denied; path=/"; }
        };
        document.addEventListener("DOMContentLoaded", function () {
          var host = document.getElementById("usercentrics-root");
          var root = host.attachShadow({ mode: "open" });
          // REAL USERCENTRICS ATTRIBUTES. The adapter targets
          // [data-testid='uc-deny-all-button']; a fixture with its own ids
          // would exercise the GENERIC adapter's fallback instead and quietly
          // stop testing the thing it is named after.
          root.innerHTML =
            '<div role="dialog" aria-label="Consent">' +
            '<button id="uc-accept" data-testid="uc-accept-all-button">Accept All</button>' +
            '<button id="uc-deny" data-testid="uc-deny-all-button">Deny</button>' +
            '<button id="uc-more" data-testid="uc-more-button">More</button></div>';
          root.getElementById("uc-accept").addEventListener("click", function () {
            document.cookie = "uc=accepted; path=/";
            host.remove();
            var s = document.createElement("script");
            s.src = "__THIRD_PARTY__/tracker.js";
            document.head.appendChild(s);
          });
          root.getElementById("uc-deny").addEventListener("click", function () {
            document.cookie = "uc=denied; path=/";
            host.remove();
          });
        });
      </script>`,
    ),
  },

  /* ── The generic adapter's strategies (§4.15 F08–F10) ────────────────── */

  F08: {
    id: "F08",
    describes: "Custom banner, plain-text buttons — accessible-name strategy",
    html: bannerPage({
      heading: "Generic banner",
      banner: `<div data-pdm-banner id="cookie-banner" role="dialog" aria-label="Cookie consent">
        <p>We use cookies.</p>
        <button id="accept">Accept all</button>
        <button id="reject">Reject all</button>
      </div>`,
      acceptSelector: "#accept",
      rejectSelector: "#reject",
    }),
  },

  F09: {
    id: "F09",
    describes:
      "Icon-only reject with aria-label — accessible name succeeds where text matching cannot",
    html: bannerPage({
      heading: "Icon banner",
      banner: `<div data-pdm-banner id="cookie-banner" role="dialog" aria-label="Cookie consent">
        <button id="accept" aria-label="Accept all cookies">✓</button>
        <button id="reject" aria-label="Reject all cookies">✕</button>
      </div>`,
      acceptSelector: "#accept",
      rejectSelector: "#reject",
    }),
  },

  F10: {
    id: "F10",
    describes:
      "Only a Manage preferences control — reject reachable through the preferences fallback",
    html: page(
      `<h1>Preferences only</h1>
       <div data-pdm-banner id="cookie-banner" role="dialog" aria-label="Cookie consent">
         <p>We use cookies.</p>
         <button id="accept">Accept all</button>
         <button id="manage">Manage preferences</button>
       </div>
       <div id="prefs" hidden>
         <button id="save-none">Save without accepting</button>
       </div>`,
      `<script>
        document.addEventListener("DOMContentLoaded", function () {
          document.getElementById("manage").addEventListener("click", function () {
            document.getElementById("prefs").hidden = false;
          });
          document.getElementById("save-none").addEventListener("click", function () {
            document.cookie = "consent=rejected; path=/";
            document.getElementById("cookie-banner").remove();
            document.getElementById("prefs").hidden = true;
          });
          document.getElementById("accept").addEventListener("click", function () {
            document.cookie = "consent=accepted; path=/";
            document.getElementById("cookie-banner").remove();
          });
        });
      </script>`,
    ),
  },

  /* ── Pre-consent firing (§4.15 F11–F12) ─────────────────────────────── */

  F11: {
    id: "F11",
    describes: "Analytics tag fires before any consent interaction — evidence is NO_CONSENT",
    html: page(
      `<h1>Pre-consent analytics</h1>
       <div data-pdm-banner id="cookie-banner" role="dialog"><button id="reject">Reject all</button></div>`,
      `<script src="__THIRD_PARTY__/gtag/js?id=G-TEST"></script>
       <script>document.cookie = "_ga=GA1.2.999; path=/";</script>`,
    ),
  },

  F12: {
    id: "F12",
    describes: "Marketing pixel fires before any consent interaction — the critical shape",
    html: page(
      `<h1>Pre-consent pixel</h1>
       <div data-pdm-banner id="cookie-banner" role="dialog"><button id="reject">Reject all</button></div>`,
      `<script>
         var pixel = new Image();
         pixel.src = "__THIRD_PARTY__/tr?id=999&ev=PageView";
         document.cookie = "_fbp=fb.1.1700000000.123; path=/";
       </script>`,
    ),
  },

  /* ── Consent honoured, or not (§4.15 F13–F15) ───────────────────────── */

  F13: {
    id: "F13",
    describes: "REJECT ALL FAILS — the tag fires anyway after rejection",
    html: page(
      `<h1>Reject ignored</h1>
       <div data-pdm-banner id="cookie-banner" role="dialog" aria-label="Cookie consent">
         <button id="accept">Accept all</button>
         <button id="reject">Reject all</button>
       </div>`,
      `<script>
        document.addEventListener("DOMContentLoaded", function () {
          function load() {
            var s = document.createElement("script");
            s.src = "__THIRD_PARTY__/tracker.js";
            document.head.appendChild(s);
          }
          // Both paths load the tracker. That is the defect being modelled.
          document.getElementById("accept").addEventListener("click", load);
          document.getElementById("reject").addEventListener("click", function () {
            document.cookie = "consent=rejected; path=/";
            document.getElementById("cookie-banner").remove();
            load();
          });
        });
      </script>`,
    ),
  },

  F14: {
    id: "F14",
    describes: "ACCEPT ALL WORKS — several tags load only after acceptance",
    html: page(
      `<h1>Accept works</h1>
       <div data-pdm-banner id="cookie-banner" role="dialog" aria-label="Cookie consent">
         <button id="accept">Accept all</button>
         <button id="reject">Reject all</button>
       </div>`,
      `<script>
        document.addEventListener("DOMContentLoaded", function () {
          document.getElementById("accept").addEventListener("click", function () {
            document.cookie = "consent=accepted; path=/";
            document.getElementById("cookie-banner").remove();
            ["/a.js", "/b.js", "/c.js"].forEach(function (path) {
              var s = document.createElement("script");
              s.src = "__THIRD_PARTY__" + path;
              document.head.appendChild(s);
            });
          });
          document.getElementById("reject").addEventListener("click", function () {
            document.cookie = "consent=rejected; path=/";
            document.getElementById("cookie-banner").remove();
          });
        });
      </script>`,
    ),
  },

  F15: {
    id: "F15",
    describes: "WITHDRAWAL FAILS — tags keep firing after consent is withdrawn",
    html: page(
      `<h1>Withdrawal ignored</h1>
       <div data-pdm-banner id="cookie-banner" role="dialog" aria-label="Cookie consent">
         <button id="accept">Accept all</button>
         <button id="reject">Reject all</button>
       </div>
       <button id="manage">Manage preferences</button>`,
      `<script>
        function beacon() {
          var i = new Image();
          i.src = "__THIRD_PARTY__/pixel.gif?t=" + Date.now();
        }
        document.addEventListener("DOMContentLoaded", function () {
          document.getElementById("accept").addEventListener("click", function () {
            document.cookie = "consent=accepted; path=/";
            document.getElementById("cookie-banner").remove();
            beacon();
            // Withdrawing clears the cookie but never stops the beacon.
            setInterval(beacon, 400);
          });
          document.getElementById("reject").addEventListener("click", function () {
            document.cookie = "consent=rejected; path=/";
            document.getElementById("cookie-banner").remove();
          });
          document.getElementById("manage").addEventListener("click", function () {
            document.cookie = "consent=; path=/; max-age=0";
          });
        });
      </script>`,
    ),
  },

  /* ── Drift and classification (§4.15 F16–F18) ───────────────────────── */

  F16: {
    id: "F16",
    describes: "A tracker that was not on the previous scan — the TRACKER_ADDED shape",
    html: page(
      "<h1>New tracker</h1>",
      `<script src="__THIRD_PARTY__/tracker.js"></script>
       <script src="__THIRD_PARTY__/newly-added.js"></script>`,
    ),
  },

  F17: {
    id: "F17",
    describes: "A third party we do not recognise — recorded by domain, never dropped",
    html: page(
      "<h1>Unknown vendor</h1>",
      `<script src="__THIRD_PARTY__/weird-analytics/collect.js"></script>`,
    ),
  },

  F18: {
    id: "F18",
    describes: "Third-party CDN and web fonts only — informational, never critical",
    html: page(
      "<h1>CDN only</h1>",
      `<link rel="stylesheet" href="__THIRD_PARTY__/fonts/css?family=Inter">
       <script src="__THIRD_PARTY__/cdn/lib.js"></script>`,
    ),
  },

  /* ── Hard page shapes (§4.15 F19–F23) ───────────────────────────────── */

  F19: {
    id: "F19",
    describes: "SPA — a client-side route change fires a tag; it must still be captured",
    html: page(
      `<h1>SPA</h1><a id="go" href="/about">About</a>`,
      `<script>
        document.addEventListener("DOMContentLoaded", function () {
          document.getElementById("go").addEventListener("click", function (event) {
            event.preventDefault();
            history.pushState({}, "", "/about");
            var i = new Image();
            i.src = "__THIRD_PARTY__/pixel.gif?route=/about";
          });
          // Auto-navigate so the fixture needs no interaction to exercise it.
          setTimeout(function () { document.getElementById("go").click(); }, 300);
        });
      </script>`,
    ),
  },

  F20: {
    id: "F20",
    describes:
      "Heavy JS — a tag injected long after load, caught only by the observation window",
    /*
     * ⚠️ 1.2s, NOT §4.15's 5s. The observation window is 10s, so both are
     * inside it and prove the same property — but 5s × every run of this
     * fixture is minutes of CI for no extra signal. The window's UPPER bound is
     * asserted separately, without a browser.
     */
    html: page("<h1>Deferred tag</h1>", deferredScript("/late.js", 1200)),
  },

  F21: {
    id: "F21",
    describes: "CMP rendered inside an IFRAME — the consent frame must be found and driven",
    html: page(
      `<h1>Iframe CMP</h1><iframe id="cmp" src="/cmp-frame" title="Consent" width="400" height="120"></iframe>`,
    ),
    routes: {
      "/cmp-frame": {
        contentType: "text/html; charset=utf-8",
        body: `<!doctype html><html lang="en"><body>
          <div role="dialog" aria-label="Cookie consent">
            <button id="accept">Accept all</button>
            <button id="reject">Reject all</button>
          </div>
          <script>
            document.getElementById("reject").addEventListener("click", function () {
              document.cookie = "consent=rejected; path=/";
            });
          </script>
        </body></html>`,
      },
    },
  },

  F22: {
    id: "F22",
    describes:
      "Bot challenge that never resolves — must end PARTIAL or FAILED, never a clean pass",
    html: page(
      `<h1>Checking your browser…</h1><p id="status">Please wait</p>`,
      `<script>
        // No banner, no content, and nothing ever completes. A scanner that
        // reports this as clean is the failure this fixture exists to catch.
        setInterval(function () {
          document.getElementById("status").textContent = "Please wait " + Date.now();
        }, 250);
      </script>`,
    ),
  },

  F23: {
    id: "F23",
    describes: "Very slow first byte — navigation timeout is handled as a clean failure",
    html: page("<h1>Eventually</h1>"),
    // Overridable per test; §4.15 specifies 20s, which no unit test should wait for.
    documentDelayMs: 20_000,
  },

  F24: {
    id: "F24",
    describes: "Server returns 500 on the document — FAILED with an HTTP error code",
    html: "",
    documentStatus: 500,
  },

  /* ── Cookies and normalisation (§4.15 F25–F28) ──────────────────────── */

  F25: {
    id: "F25",
    describes: "A cookie with a five-year expiry — long lifetime is worth reporting",
    html: page(
      "<h1>Long cookie</h1>",
      `<script>
        var far = new Date(Date.now() + 5 * 365 * 24 * 3600 * 1000).toUTCString();
        document.cookie = "_long_id=abc123; expires=" + far + "; path=/";
      </script>`,
    ),
  },

  F26: {
    id: "F26",
    describes:
      "Cookie name rotates on every load — normalisation must collapse it to one identity",
    html: page(
      "<h1>Rotating cookie</h1>",
      `<script>
        var suffix = Math.random().toString(36).slice(2, 10);
        document.cookie = "_cf_bm_" + suffix + "=1; path=/";
      </script>`,
    ),
  },

  F27: {
    id: "F27",
    describes: "Cache-busted script URL — normalisation must not report a new script",
    html: page(
      "<h1>Hashed asset</h1>",
      `<script>
        var hash = Math.random().toString(36).slice(2, 10);
        var s = document.createElement("script");
        s.src = "__THIRD_PARTY__/app." + hash + ".js";
        document.head.appendChild(s);
      </script>`,
    ),
  },

  F28: {
    id: "F28",
    describes:
      "Byte-identical on every load — scanning twice must produce ZERO drift. The hard gate",
    /*
     * ⚠️ §4.15's HARD CI GATE: "any change producing spurious drift fails the
     * build." Nothing on this page may vary between loads — no timestamps, no
     * random values, no cache-busting. If you are tempted to add one, add it to
     * F26 or F27 instead.
     */
    html: page(
      "<h1>Deterministic</h1>",
      `<script src="__THIRD_PARTY__/tracker.js"></script>
       <script>document.cookie = "stable=1; path=/";</script>`,
    ),
  },

  /* ── Transport and robots (§4.15 F29–F30) ───────────────────────────── */

  F29: {
    id: "F29",
    describes: "Plain HTTP with a mixed-content subresource — transport security finding",
    html: page(
      "<h1>Insecure transport</h1>",
      `<script src="http://insecure.example/tag.js"></script>`,
    ),
  },

  F30: {
    id: "F30",
    describes: "robots.txt disallows our user agent — the scan is skipped, and says so",
    html: page("<h1>Disallowed</h1>"),
    robotsTxt: "User-agent: PrivacyDriftMonitor\nDisallow: /\n",
  },

  /* ── Ours, not the plan's ───────────────────────────────────────────── */

  X01: {
    id: "X01",
    describes: "First-party subresource only — must NOT be classified third-party",
    html: page("<h1>First party</h1>", `<script src="/assets/app.js"></script>`),
    routes: {
      "/assets/app.js": { body: "window.__app = 1;", contentType: "application/javascript" },
    },
  },

  X02: {
    id: "X02",
    describes:
      "Banner with NO reject control at all — reject must be UNDETERMINED, never passed",
    html: page(
      `<h1>Accept-only banner</h1>
       <div data-pdm-banner id="cookie-banner" role="dialog"><button id="accept">Got it</button></div>`,
    ),
  },

  X03: {
    id: "X03",
    describes: "Endless polling — the page never reaches network idle",
    html: page(
      "<h1>Never settles</h1>",
      `<script>setInterval(function () { fetch("/poll"); }, 150);</script>`,
    ),
  },

  X04: {
    id: "X04",
    describes: "localStorage and sessionStorage written before any consent",
    html: page(
      "<h1>Pre-consent storage</h1>",
      `<script>
        localStorage.setItem("_fbp", "fb.1.1700000000.123456789");
        localStorage.setItem("theme", "dark");
        sessionStorage.setItem("sid", "abc123");
      </script>`,
    ),
  },

  X05: {
    id: "X05",
    describes: "Tracker fires only on scroll — the scroll step must trigger it",
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
};

/** The 30 rows §4.15 fixes, in order. Used by the CI contract check. */
export const PLAN_FIXTURE_IDS: readonly string[] = Array.from(
  { length: 30 },
  (_unused, index) => `F${String(index + 1).padStart(2, "0")}`,
);
