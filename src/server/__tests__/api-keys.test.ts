import { beforeEach, describe, expect, it } from "vitest";
import { makeAgency, resetDatabase } from "@pdm/database/testing";
import {
  generateApiKey,
  listApiKeys,
  revokeApiKey,
} from "../services/api-keys";
import { authenticateApiKey, requireApiScope } from "../auth/api-auth";

describe("Public REST API Keys & Auth", () => {
  let agencyId: string;

  beforeEach(async () => {
    await resetDatabase();
    const agency = await makeAgency({ name: "API Test Agency" });
    agencyId = agency.id;
  });

  it("generates a secure API key with prefix and SHA-256 hash", async () => {
    const key = await generateApiKey(agencyId, {
      name: "CI/CD Deployment Key",
      scopes: ["read", "write"],
    });

    expect(key.name).toBe("CI/CD Deployment Key");
    expect(key.keyPrefix).toMatch(/^pdm_live_[0-9a-f]{8}\.\.\.$/);
    expect(key.secretToken).toMatch(/^pdm_live_[0-9a-f]{48}$/);
    expect(key.scopes).toEqual(["read", "write"]);

    const list = await listApiKeys(agencyId);
    expect(list.length).toBe(1);
    expect(list[0].id).toBe(key.id);
    expect(list[0].name).toBe("CI/CD Deployment Key");
    expect(list[0].keyPrefix).toBe(key.keyPrefix);
    expect((list[0] as unknown as Record<string, unknown>).secretToken).toBeUndefined();
    expect((list[0] as unknown as Record<string, unknown>).keyHash).toBeUndefined();
  });

  it("authenticates valid Bearer token in request headers", async () => {
    const key = await generateApiKey(agencyId, {
      name: "Production Token",
      scopes: ["read"],
    });

    const req = new Request("https://api.example.com/api/v1/websites", {
      headers: {
        Authorization: `Bearer ${key.secretToken}`,
      },
    });

    const auth = await authenticateApiKey(req);
    expect(auth).not.toBeNull();
    expect(auth?.agencyId).toBe(agencyId);
    expect(auth?.keyId).toBe(key.id);
    expect(auth?.scopes).toEqual(["read"]);

    // Scope check
    const readErr = requireApiScope(auth!, "read");
    expect(readErr).toBeNull();

    const writeErr = requireApiScope(auth!, "write");
    expect(writeErr).not.toBeNull();
    expect(writeErr?.status).toBe(403);
  });

  it("rejects invalid, missing, or malformed API tokens", async () => {
    // Missing Authorization
    const reqNoAuth = new Request("https://api.example.com/api/v1/websites");
    expect(await authenticateApiKey(reqNoAuth)).toBeNull();

    // Not a Bearer scheme
    const reqBasic = new Request("https://api.example.com/api/v1/websites", {
      headers: { Authorization: "Basic dXNlcjpwYXNz" },
    });
    expect(await authenticateApiKey(reqBasic)).toBeNull();

    // Invalid prefix format
    const reqInvalid = new Request("https://api.example.com/api/v1/websites", {
      headers: { Authorization: "Bearer sk_invalid_token" },
    });
    expect(await authenticateApiKey(reqInvalid)).toBeNull();

    // Random non-existent token
    const reqNonExistent = new Request("https://api.example.com/api/v1/websites", {
      headers: { Authorization: "Bearer pdm_live_0123456789abcdef0123456789abcdef0123456789abcdef" },
    });
    expect(await authenticateApiKey(reqNonExistent)).toBeNull();
  });

  it("revokes an API key successfully and denies subsequent auth", async () => {
    const key = await generateApiKey(agencyId, {
      name: "Temporary Key",
      scopes: ["read", "write"],
    });

    await revokeApiKey(agencyId, key.id);

    const req = new Request("https://api.example.com/api/v1/websites", {
      headers: {
        Authorization: `Bearer ${key.secretToken}`,
      },
    });

    expect(await authenticateApiKey(req)).toBeNull();
  });
});
