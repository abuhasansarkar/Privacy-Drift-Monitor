import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { TOOLS, executeTool, type ToolContext } from "./tools";

export interface McpServerOptions {
  name?: string;
  version?: string;
  context?: ToolContext;
}

export function createMcpServer(options: McpServerOptions = {}): Server {
  const name = options.name ?? "privacy-drift-monitor";
  const version = options.version ?? "3.0.0";

  const server = new Server(
    { name, version },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: TOOLS,
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name: toolName, arguments: args } = request.params;

    if (!options.context) {
      // F-002: a server without a resolved tenant refuses every call. This is
      // unreachable through `createMcpServer()` in `index.ts` (the tenant is
      // resolved at startup), but a host constructing the server directly must
      // not get a global-database fallback.
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: "MCP server has no tenant context. Construct it with a context resolved via resolveTenant().",
          },
        ],
      };
    }

    try {
      const result = await executeTool(
        toolName,
        (args ?? {}) as Record<string, unknown>,
        options.context,
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Error executing ${toolName}: ${message}`,
          },
        ],
      };
    }
  });

  return server;
}
