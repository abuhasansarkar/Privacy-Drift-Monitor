import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer } from "./server";
import { resolveTenant } from "./tools";

export * from "./server";
export * from "./tools";

async function main() {
  /*
   * ⚠️ THE TENANT IS RESOLVED BEFORE THE SERVER ACCEPTS A SINGLE REQUEST
   * (F-002). A stdio MCP server has no per-request credential, so its whole
   * lifetime is one tenant or it is unsafe. Resolving the key here — and
   * refusing to start without one — is the difference between "a tool that
   * happens to be scoped today" and "a server that cannot run unscoped".
   */
  const { unsafeGlobalClient } = await import("@pdm/database");
  const lookupDb = unsafeGlobalClient(
    // Justification (required in review): the API-key lookup is the credential
    // check itself — the key is not yet bound to a tenant, which is the point
    // of the lookup. Every tool call afterwards goes through `forAgency`.
    "API key lookup at MCP startup; resolves the single tenant the server is pinned to",
  );

  const ctx = await resolveTenant({
    apiKey: process.env.PDM_API_KEY,
    lookup: async (keyHash) => {
      const key = await lookupDb.apiKey.findUnique({
        where: { keyHash },
        select: {
          agencyId: true,
          expiresAt: true,
          agency: { select: { status: true } },
        },
      });
      if (!key) return null;
      if (key.expiresAt && key.expiresAt < new Date()) return null;
      if (key.agency.status !== "ACTIVE") return null;
      return { agencyId: key.agencyId };
    },
  });

  const server = createMcpServer({ context: ctx });
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`Privacy Drift Monitor MCP Server running on stdio (agency ${ctx.agencyId})`);
}

// If invoked as a CLI executable directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error("MCP Server Fatal Error:", error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
