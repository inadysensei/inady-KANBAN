#!/usr/bin/env node
/**
 * inady-kanban-mcp-server (stdio) — a local, no-auth MCP server that lets a
 * coding agent (Cursor / Claude) create, update and read tickets on this inady
 * KANBAN board.
 *
 * This is the classic `npm run mcp` subprocess: it speaks MCP over **stdio**.
 * The board now also exposes the very same tools over **Streamable HTTP** at
 * `/mcp` on the running server (server.ts) — prefer that when the board is up,
 * since it needs no subprocess. Both are built from the one `createMcpServer()`
 * factory (src/lib/inady-kanban-mcp.ts), so they can't drift apart.
 *
 * Architecture: this process holds NO ticket logic of its own. Every tool is a
 * thin translation of an MCP call into a request against the board's own
 * `/api/tickets` HTTP endpoints (server.ts), which call the single source of
 * truth in src/lib/ticket-core.ts. So MCP, the HTTP API, and the board UI all
 * go through one implementation — they cannot drift apart.
 *
 * Requires the inady KANBAN server to be running (npm run dev). Target URL is
 * $INADY_KANBAN_URL, else the local server (http://localhost:7373). No
 * authentication by design: localhost, single user.
 *
 * Run: `npm run mcp` (tsx mcp-server.ts). Speaks MCP over stdio, so nothing must
 * be written to stdout except protocol frames — all diagnostics go to stderr.
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer } from "./src/lib/inady-kanban-mcp";
import { serverBaseUrl } from "./src/lib/server-config";

async function main(): Promise<void> {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  const target = process.env.INADY_KANBAN_URL ?? serverBaseUrl();
  console.error(`inady-kanban-mcp-server ready (stdio) — target ${target}`);
}

main().catch((err) => {
  console.error("inady-kanban-mcp-server fatal error:", err);
  process.exit(1);
});
