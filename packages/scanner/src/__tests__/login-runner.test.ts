import { describe, expect, it, vi } from "vitest";
import type { Page } from "playwright";
import { decryptCredentials, encryptCredentials } from "../auth/crypto";
import { performAuthenticatedLogin } from "../auth/login-runner";

describe("Credential Vault & Authenticated Login Runner", () => {
  const credentials = {
    username: "audit_tester@example.com",
    password: "SuperSecretPassword123!",
  };

  describe("AES-256-GCM Credential Encryption", () => {
    it("round-trips credentials cleanly with authenticated tags", () => {
      const encrypted = encryptCredentials(credentials);
      expect(encrypted).toMatch(/^[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]+$/);

      // Verify plaintext password never leaks in encrypted string
      expect(encrypted).not.toContain("SuperSecretPassword123!");
      expect(encrypted).not.toContain("audit_tester@example.com");

      const decrypted = decryptCredentials(encrypted);
      expect(decrypted.username).toBe(credentials.username);
      expect(decrypted.password).toBe(credentials.password);
    });

    it("rejects tampered or malformed payloads", () => {
      const encrypted = encryptCredentials(credentials);
      const [iv, tag, ciphertext] = encrypted.split(":") as [string, string, string];

      // Tampered ciphertext
      const tampered = `${iv}:${tag}:${ciphertext.slice(0, -2)}aa`;
      expect(() => decryptCredentials(tampered)).toThrow();

      // Malformed format
      expect(() => decryptCredentials("not-a-valid-payload")).toThrow();
    });
  });

  describe("performAuthenticatedLogin", () => {
    it("blocks SSRF loopback URLs before initiating browser navigation", async () => {
      const encrypted = encryptCredentials(credentials);
      const mockPage = {} as Page;

      const result = await performAuthenticatedLogin(mockPage, {
        loginUrl: "http://127.0.0.1:8080/login",
        usernameSelector: "#username",
        passwordSelector: "#password",
        submitSelector: "#btn-login",
        encryptedSecrets: encrypted,
        isActive: true,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("SSRF");
    });

    it("executes login sequence and returns authenticated cookies and redirected URL", async () => {
      const encrypted = encryptCredentials(credentials);

      let currentUrl = "https://example.com/login";
      const filledFields: Record<string, string> = {};

      const mockPage = {
        goto: vi.fn().mockImplementation(async (url: string) => {
          currentUrl = url;
        }),
        waitForSelector: vi.fn().mockResolvedValue(true),
        fill: vi.fn().mockImplementation(async (selector: string, value: string) => {
          filledFields[selector] = value;
        }),
        click: vi.fn().mockImplementation(async () => {
          currentUrl = "https://example.com/dashboard";
        }),
        waitForNavigation: vi.fn().mockResolvedValue(null),
        waitForTimeout: vi.fn().mockResolvedValue(null),
        url: () => currentUrl,
        context: () => ({
          cookies: vi.fn().mockResolvedValue([
            { name: "pdm_session", domain: "example.com", path: "/" },
          ]),
        }),
      } as unknown as Page;

      const result = await performAuthenticatedLogin(mockPage, {
        loginUrl: "https://example.com/login",
        usernameSelector: "#user",
        passwordSelector: "#pass",
        submitSelector: "#submit-btn",
        encryptedSecrets: encrypted,
        isActive: true,
      });

      expect(result.success).toBe(true);
      expect(result.finalUrl).toBe("https://example.com/dashboard");
      expect(result.cookies).toHaveLength(1);
      expect(result.cookies[0]?.name).toBe("pdm_session");
      expect(filledFields["#user"]).toBe(credentials.username);
      expect(filledFields["#pass"]).toBe(credentials.password);
    });
  });
});
