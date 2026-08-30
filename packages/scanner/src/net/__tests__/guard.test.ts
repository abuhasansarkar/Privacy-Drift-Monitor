import { describe, expect, it } from "vitest";
import {
  assertSafeAddress,
  assertSafeRedirect,
  assertSafeUrl,
  MAX_REDIRECT_HOPS,
  SSRF_USER_MESSAGE,
  SsrfBlockedError,
} from "../guard";

/**
 * SSRF VECTOR SUITE — PLAN.md Part X §10.3, Phase 1 task 1.7.
 *
 * Coverage-gated at ≥85% (§12.2) and re-run manually pre-release and quarterly.
 *
 * DNS is injected, so this suite is hermetic — no network, no flakes, and it
 * can assert on hosts we could never rely on resolving a particular way in CI.
 */

/** A resolver that maps hostnames to fixed addresses. */
const stubResolver =
  (map: Record<string, string[]>) => async (hostname: string) => {
    const addresses = map[hostname];
    if (!addresses) {
      const err = new Error("getaddrinfo ENOTFOUND");
      throw err;
    }
    return addresses.map((address) => ({
      address,
      family: address.includes(":") ? 6 : 4,
    }));
  };

const PUBLIC = stubResolver({ "example.com": ["93.184.216.34"] });

async function expectBlocked(promise: Promise<unknown>, reason?: string) {
  await expect(promise).rejects.toBeInstanceOf(SsrfBlockedError);
  if (reason) {
    await expect(promise).rejects.toMatchObject({ reason });
  }
}

describe("scheme handling", () => {
  it.each([
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "file:///etc/passwd",
    "ftp://example.com/",
    "gopher://example.com:70/",
  ])("blocks %s", async (url) => {
    await expectBlocked(assertSafeUrl(url, { resolver: PUBLIC }), "BAD_SCHEME");
  });

  it("allows http and https", async () => {
    await expect(
      assertSafeUrl("https://example.com/", { resolver: PUBLIC }),
    ).resolves.toMatchObject({ hostname: "example.com" });
    await expect(
      assertSafeUrl("http://example.com/", { resolver: PUBLIC }),
    ).resolves.toMatchObject({ hostname: "example.com" });
  });
});

describe("port allowlist (§10.3)", () => {
  it.each([
    "http://example.com:22/",
    "http://example.com:3306/",
    "http://example.com:5432/",
    "http://example.com:6379/",
    "http://example.com:9200/",
  ])("blocks %s", async (url) => {
    // A public IP on an arbitrary port is still somebody's internal service;
    // the address-range checks say nothing about what is listening.
    await expectBlocked(assertSafeUrl(url, { resolver: PUBLIC }), "BAD_PORT");
  });

  it.each([
    "http://example.com/",
    "https://example.com/",
    "http://example.com:80/",
    "https://example.com:443/",
    "https://example.com:8443/",
    "http://example.com:8080/",
  ])("allows %s", async (url) => {
    // 8080/8443 are allowed on purpose: staging sites genuinely use them and
    // refusing would break a real agency workflow.
    await expect(
      assertSafeUrl(url, { resolver: PUBLIC }),
    ).resolves.toMatchObject({ hostname: "example.com" });
  });

  it("blocks a bad port before resolving DNS", async () => {
    // The check is free and ordering it first avoids a lookup for a URL we
    // were never going to fetch.
    let resolverCalled = false;
    await expectBlocked(
      assertSafeUrl("http://example.com:22/", {
        resolver: async () => {
          resolverCalled = true;
          return [{ address: "93.184.216.34", family: 4 }];
        },
      }),
      "BAD_PORT",
    );
    expect(resolverCalled).toBe(false);
  });
});

describe("embedded credentials", () => {
  it("blocks the userinfo bypass", async () => {
    // Reads as example.com to a human; the browser connects to 127.0.0.1.
    await expectBlocked(
      assertSafeUrl("http://example.com@127.0.0.1/", { resolver: PUBLIC }),
      "URL_HAS_CREDENTIALS",
    );
  });

  it("blocks user:pass form", async () => {
    await expectBlocked(
      assertSafeUrl("http://user:pass@example.com/", { resolver: PUBLIC }),
      "URL_HAS_CREDENTIALS",
    );
  });
});

describe("IP literals", () => {
  it.each([
    ["http://127.0.0.1/", "LOOPBACK_ADDRESS"],
    ["http://127.1.2.3/", "LOOPBACK_ADDRESS"],
    ["http://0.0.0.0/", "RESERVED_ADDRESS"],
    ["http://10.0.0.1/", "PRIVATE_ADDRESS"],
    ["http://172.16.0.1/", "PRIVATE_ADDRESS"],
    ["http://172.31.255.255/", "PRIVATE_ADDRESS"],
    ["http://192.168.1.1/", "PRIVATE_ADDRESS"],
    ["http://100.64.0.1/", "RESERVED_ADDRESS"],
    ["http://224.0.0.1/", "MULTICAST_ADDRESS"],
    ["http://255.255.255.255/", "RESERVED_ADDRESS"],
    ["http://[::1]/", "LOOPBACK_ADDRESS"],
    ["http://[fe80::1]/", "LINK_LOCAL_ADDRESS"],
    ["http://[fc00::1]/", "UNIQUE_LOCAL_ADDRESS"],
  ])("blocks %s", async (url, reason) => {
    await expectBlocked(assertSafeUrl(url, { resolver: PUBLIC }), reason);
  });

  it("allows a public IP literal", async () => {
    await expect(
      assertSafeUrl("http://93.184.216.34/", { resolver: PUBLIC }),
    ).resolves.toMatchObject({ pinnedAddress: "93.184.216.34" });
  });
});

describe("cloud metadata endpoints", () => {
  it.each([
    "http://169.254.169.254/latest/meta-data/",
    "http://169.254.170.2/v2/credentials",
    "http://100.100.100.200/",
  ])("blocks %s", async (url) => {
    await expectBlocked(assertSafeUrl(url, { resolver: PUBLIC }));
  });

  it("blocks metadata reached through an IPv4-mapped IPv6 literal", async () => {
    // ipaddr.js reports this range as "ipv4Mapped"; trusting that name without
    // unwrapping would let the most valuable SSRF target through.
    await expectBlocked(
      assertSafeUrl("http://[::ffff:169.254.169.254]/", { resolver: PUBLIC }),
      "CLOUD_METADATA_ADDRESS",
    );
  });

  it("blocks loopback reached through an IPv4-mapped IPv6 literal", async () => {
    await expectBlocked(
      assertSafeUrl("http://[::ffff:127.0.0.1]/", { resolver: PUBLIC }),
      "LOOPBACK_ADDRESS",
    );
  });

  it("blocks a hostname that RESOLVES to metadata", async () => {
    // The realistic attack: attacker controls DNS, points a normal-looking
    // domain at the metadata service.
    const resolver = stubResolver({ "evil.example": ["169.254.169.254"] });
    await expectBlocked(
      assertSafeUrl("https://evil.example/", { resolver }),
      "CLOUD_METADATA_ADDRESS",
    );
  });
});

describe("DNS resolution", () => {
  it("blocks when ANY resolved address is unsafe", async () => {
    // Split-horizon / rebinding: one public record makes it look fine.
    const resolver = stubResolver({
      "rebind.example": ["93.184.216.34", "127.0.0.1"],
    });
    await expectBlocked(
      assertSafeUrl("https://rebind.example/", { resolver }),
      "LOOPBACK_ADDRESS",
    );
  });

  it("blocks on NXDOMAIN", async () => {
    await expectBlocked(
      assertSafeUrl("https://nope.example/", { resolver: stubResolver({}) }),
      "DNS_FAILURE",
    );
  });

  it("blocks when DNS returns no records", async () => {
    await expectBlocked(
      assertSafeUrl("https://empty.example/", { resolver: async () => [] }),
      "NO_ADDRESSES",
    );
  });

  it("pins the resolved address so the caller cannot re-resolve", async () => {
    // R4: returning the IP is what closes the TOCTOU window between the check
    // and the connection.
    const target = await assertSafeUrl("https://example.com/", { resolver: PUBLIC });
    expect(target.pinnedAddress).toBe("93.184.216.34");
    expect(target.allAddresses).toEqual(["93.184.216.34"]);
  });
});

describe("redirect revalidation", () => {
  it("blocks a redirect into private space", async () => {
    // The most common real-world bypass: public URL, 302 to the metadata service.
    await expectBlocked(
      assertSafeRedirect("http://169.254.169.254/", "https://example.com/", 0, {
        resolver: PUBLIC,
      }),
    );
  });

  it("resolves a relative redirect against the previous URL", async () => {
    const target = await assertSafeRedirect("/next", "https://example.com/a", 0, {
      resolver: PUBLIC,
    });
    expect(target.url).toBe("https://example.com/next");
  });

  it("enforces the hop limit", async () => {
    await expectBlocked(
      assertSafeRedirect("https://example.com/", "https://example.com/", MAX_REDIRECT_HOPS, {
        resolver: PUBLIC,
      }),
      "REDIRECT_LIMIT",
    );
  });
});

describe("blocklist", () => {
  it("blocks an admin-blocklisted domain", async () => {
    await expectBlocked(
      assertSafeUrl("https://example.com/", {
        resolver: PUBLIC,
        blocklist: new Set(["example.com"]),
      }),
      "BLOCKLISTED_DOMAIN",
    );
  });
});

describe("user-facing message", () => {
  it("is identical for every rejection reason", async () => {
    // R7: a message that varies by reason is a probe oracle — an attacker maps
    // the internal network by reading which error comes back.
    const urls = [
      "http://127.0.0.1/",
      "http://169.254.169.254/",
      "http://10.0.0.1/",
      "file:///etc/passwd",
    ];
    for (const url of urls) {
      const error = await assertSafeUrl(url, { resolver: PUBLIC }).catch((e) => e);
      expect(error).toBeInstanceOf(SsrfBlockedError);
      expect(error.userMessage).toBe(SSRF_USER_MESSAGE);
    }
  });

  it("keeps the real reason available for the security log", async () => {
    const error = await assertSafeUrl("http://127.0.0.1/", {
      resolver: PUBLIC,
    }).catch((e) => e);
    expect(error.reason).toBe("LOOPBACK_ADDRESS");
    expect(error.detail).toContain("127.0.0.1");
  });
});

describe("assertSafeAddress fails closed", () => {
  it("rejects an unparseable address rather than allowing it", async () => {
    expect(() => assertSafeAddress("not-an-ip")).toThrow(SsrfBlockedError);
  });
});
