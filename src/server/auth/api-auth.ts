import "server-only";
import { createHash } from "node:crypto";
import { unsafeGlobalClient } from "@pdm/database";

export interface ApiKeyContext {
  agencyId: string;
  agencyName: string;
  apiKeyId: string;
  keyId: string;
  keyName: string;
  scopes: string[];
}

const db = unsafeGlobalClient(
  "API Key authentication lookup — key is not yet tenant-scoped",
);

/**
 * Authenticates an incoming HTTP request via Bearer API key.
 *
 * Header: `Authorization: Bearer pdm_live_...`
 * Returns ApiKeyContext on success, or null if unauthenticated.
 */
export async function authenticateApiKey(
  request: Request,
): Promise<ApiKeyContext | null> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.slice(7).trim();
  if (!token.startsWith("pdm_live_") || token.length < 20) {
    return null;
  }

  const keyHash = createHash("sha256").update(token).digest("hex");

  const apiKey = await db.apiKey.findUnique({
    where: { keyHash },
    include: {
      agency: {
        select: {
          id: true,
          name: true,
          status: true,
        },
      },
    },
  });

  if (!apiKey) {
    return null;
  }

  if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
    return null;
  }

  if (apiKey.agency.status !== "ACTIVE") {
    return null;
  }

  // Update lastUsedAt timestamp asynchronously
  void db.apiKey
    .update({
      where: { id: apiKey.id },
      data: { lastUsedAt: new Date() },
    })
    .catch(() => {});

  return {
    agencyId: apiKey.agencyId,
    agencyName: apiKey.agency.name,
    apiKeyId: apiKey.id,
    keyId: apiKey.id,
    keyName: apiKey.name,
    scopes: apiKey.scopes,
  };
}

import { NextResponse } from "next/server";

/**
 * Asserts that the authenticated API key carries the required scope (e.g. "read" or "write").
 * Returns a 403 Forbidden response if missing, or null if authorized.
 */
export function requireApiScope(
  ctx: ApiKeyContext,
  requiredScope: "read" | "write" | "admin",
): NextResponse | null {
  if (!ctx.scopes.includes(requiredScope) && !ctx.scopes.includes("admin")) {
    return NextResponse.json(
      {
        error: {
          code: "FORBIDDEN",
          message: `API key lacks the required '${requiredScope}' permission scope`,
        },
      },
      { status: 403 },
    );
  }
  return null;
}
