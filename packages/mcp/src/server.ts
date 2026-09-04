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
