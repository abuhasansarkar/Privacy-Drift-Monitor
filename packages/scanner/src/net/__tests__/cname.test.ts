import { beforeEach, describe, expect, it } from "vitest";
import {
  checkCnameCloaking,
  clearCnameCache,
  KNOWN_CLOAKING_TARGETS,
  resolveCnameChain,
} from "../cname";

describe("checkCnameCloaking", () => {
  beforeEach(() => {
    clearCnameCache();
  });

  it("detects known cloaking targets (Adobe Analytics / omtrdc.net)", async () => {
    const mockResolver = async () => ["client.sc.omtrdc.net"];

    const result = await checkCnameCloaking(
      "metrics.client.com",
      "client.com",
      mockResolver,
    );

    expect(result.isCloaked).toBe(true);
    expect(result.canonicalHost).toBe("client.sc.omtrdc.net");
    expect(result.chain).toEqual(["client.sc.omtrdc.net"]);
  });

  it("detects known cloaking targets (AdRoll / e.adroll.com)", async () => {
    const mockResolver = async () => ["d.e.adroll.com"];

    const result = await checkCnameCloaking(
      "track.shop.com",
      "shop.com",
      mockResolver,
    );

    expect(result.isCloaked).toBe(true);
    expect(result.canonicalHost).toBe("d.e.adroll.com");
  });

  it("detects third-party divergence from registrable domain", async () => {
    const mockResolver = async () => ["collector.external-adtech.net"];

    const result = await checkCnameCloaking(
      "data.brand.com",
      "brand.com",
      mockResolver,
    );

    expect(result.isCloaked).toBe(true);
    expect(result.canonicalHost).toBe("collector.external-adtech.net");
  });

  it("identifies first-party internal CNAMEs as NOT cloaked", async () => {
    const mockResolver = async () => ["origin.brand.com"];

    const result = await checkCnameCloaking(
      "assets.brand.com",
      "brand.com",
      mockResolver,
    );

    expect(result.isCloaked).toBe(false);
    expect(result.canonicalHost).toBe("origin.brand.com");
  });

  it("handles multi-hop CNAME chains", async () => {
    const mockResolver = async () => [
      "proxy.brand.com",
      "edge.cloaked-tracker.wt-eu02.net",
    ];

    const result = await checkCnameCloaking(
      "analytics.brand.com",
      "brand.com",
      mockResolver,
    );

    expect(result.isCloaked).toBe(true);
    expect(result.canonicalHost).toBe("edge.cloaked-tracker.wt-eu02.net");
    expect(result.chain).toHaveLength(2);
  });

  it("returns not cloaked when no CNAME records exist", async () => {
    const mockResolver = async () => [];

    const result = await checkCnameCloaking(
      "direct.brand.com",
      "brand.com",
      mockResolver,
    );

    expect(result.isCloaked).toBe(false);
    expect(result.canonicalHost).toBeNull();
    expect(result.chain).toHaveLength(0);
  });

  it("exports known cloaking targets including omtrdc and adroll", () => {
    expect(KNOWN_CLOAKING_TARGETS).toContain("omtrdc.net");
    expect(KNOWN_CLOAKING_TARGETS).toContain("adroll.com");
    expect(KNOWN_CLOAKING_TARGETS).toContain("criteo.com");
  });

  it("resolveCnameChain handles non-CNAME addresses gracefully without throwing", async () => {
    const chain = await resolveCnameChain("127.0.0.1");
    expect(chain).toEqual([]);
  });
});

