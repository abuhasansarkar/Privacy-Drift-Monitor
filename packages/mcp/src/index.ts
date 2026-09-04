import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer } from "./server";

export * from "./server";
export * from "./tools";

async function main() {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Privacy Drift Monitor MCP Server running on stdio");
}

// If invoked as a CLI executable directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error("MCP Server Fatal Error:", error);
    process.exit(1);
  });
}
