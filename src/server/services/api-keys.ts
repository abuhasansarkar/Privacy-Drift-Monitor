import "server-only";
import { randomBytes, createHash } from "node:crypto";
import { forAgency } from "@pdm/database/tenant";
import { NotFoundError, ValidationError } from "@pdm/shared/errors";

export interface CreateApiKeyInput {
  name: string;
  scopes?: string[];
  expiresAt?: Date | null;
}

export interface GeneratedApiKey {
  id: string;
  agencyId: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  expiresAt: Date | null;
  createdAt: Date;
  /**
   * The plaintext token. ONLY returned at generation time — never stored in
   * plaintext, and cannot be recovered if lost.
   */
  secretToken: string;
}

export interface ApiKeySummary {
  id: string;
  agencyId: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
}

/**
 * Generates a secure, cryptographically random API Key for an agency.
 *
 * Format: `pdm_live_<48 hex chars>`
 * Stored: `keyHash` (SHA-256) and `keyPrefix` (`pdm_live_...`)
 */
export async function generateApiKey(
  agencyId: string,
  input: CreateApiKeyInput,
): Promise<GeneratedApiKey> {
  const trimmedName = input.name.trim();
  if (!trimmedName) {
    throw new ValidationError("API key name is required", { details: { field: "name" } });
  }

  const rawBytes = randomBytes(24).toString("hex");
  const secretToken = `pdm_live_${rawBytes}`;
  const keyPrefix = `pdm_live_${rawBytes.slice(0, 8)}...`;
  const keyHash = createHash("sha256").update(secretToken).digest("hex");

  const scopes = input.scopes && input.scopes.length > 0 ? input.scopes : ["read", "write"];

  const db = forAgency(agencyId);
  const created = await db.apiKey.create({
    data: {
      agencyId,
      name: trimmedName,
      keyPrefix,
      keyHash,
      scopes,
      expiresAt: input.expiresAt ?? null,
    },
  });

  return {
    id: created.id,
    agencyId: created.agencyId,
    name: created.name,
    keyPrefix: created.keyPrefix,
    scopes: created.scopes,
    expiresAt: created.expiresAt,
    createdAt: created.createdAt,
    secretToken,
  };
}

/**
 * Lists all registered API keys for an agency. Plaintext secrets are never returned.
 */
export async function listApiKeys(agencyId: string): Promise<ApiKeySummary[]> {
  const db = forAgency(agencyId);
  const keys = await db.apiKey.findMany({
    where: { agencyId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      agencyId: true,
      name: true,
      keyPrefix: true,
      scopes: true,
      lastUsedAt: true,
      expiresAt: true,
      createdAt: true,
    },
  });

  return keys;
}

/**
 * Revokes (deletes) an agency API key.
 */
export async function revokeApiKey(
  agencyId: string,
  apiKeyId: string,
): Promise<{ success: boolean }> {
  const db = forAgency(agencyId);
  const existing = await db.apiKey.findFirst({
    where: { id: apiKeyId, agencyId },
    select: { id: true },
  });

  if (!existing) {
    throw new NotFoundError("API key not found", { details: { apiKeyId } });
  }

  await db.apiKey.delete({
    where: { id: apiKeyId },
  });

  return { success: true };
}
