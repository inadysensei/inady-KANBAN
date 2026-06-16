#!/usr/bin/env node
/**
 * inady-kanban-mcp-server — a local, no-auth MCP server that lets a coding agent
 * (Cursor / Claude) create, update and read tickets on this inady KANBAN board.
 *
 * Architecture: this process holds NO ticket logic of its own. Every tool is a
 * thin translation of an MCP call into a request against the board's own
 * `/api/tickets` HTTP endpoints (server.ts), which call the single source of
 * truth in src/lib/ticket-core.ts. So MCP, the HTTP API, and the board UI all
 * go through one implementation — they cannot drift apart. The request/parse/
 * error-shaping lives in src/lib/inady-kanban-mcp-client.ts (unit-tested with fetch
 * injected); this file only wires those calls to MCP tools over stdio.
 *
 * Requires the inady KANBAN server to be running (npm run dev). Target URL is
 * $INADY_KANBAN_URL, else the local server (http://localhost:7373). No authentication
 * by design: localhost, single user.
 *
 * Run: `npm run mcp` (tsx mcp-server.ts). Speaks MCP over stdio, so nothing must
 * be written to stdout except protocol frames — all diagnostics go to stderr.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  apiCreateTicket,
  apiGetTicket,
  apiListTickets,
  apiUpdateTicket,
} from "./src/lib/inady-kanban-mcp-client";
import { serverBaseUrl } from "./src/lib/server-config";

/** Run a tool body, returning its result as JSON text (or a clear error). */
async function toolResult(produce: () => Promise<unknown>): Promise<CallToolResult> {
  try {
    const data = await produce();
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
  }
}

const server = new McpServer({
  name: "inady-kanban-mcp-server",
  version: "0.1.0",
});

server.registerTool(
  "inady_kanban_list_tickets",
  {
    title: "List inady KANBAN tickets",
    description:
      "List inady KANBAN board tickets, newest column first (To Do → Doing → " +
      "WIP → Done) then by in-column order. Optionally filter to one column " +
      "with `status`. Returns an array of ticket rows (id, title, description, " +
      "status, workingDir, position, timestamps). Use this to find a ticket's " +
      "id before reading or updating it.",
    inputSchema: {
      status: z
        .enum(["todo", "doing", "wip", "done"])
        .optional()
        .describe("Only return tickets in this column. Omit to list all."),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async ({ status }) =>
    toolResult(async () => {
      const tickets = await apiListTickets(status ? { status } : {});
      return { count: tickets.length, tickets };
    }),
);

server.registerTool(
  "inady_kanban_get_ticket",
  {
    title: "Get an inady KANBAN ticket",
    description:
      "Fetch a single inady KANBAN ticket by its id (UUID). Returns the full ticket " +
      "row, or an error if no ticket has that id. Get the id from " +
      "inady_kanban_list_tickets first if you don't have it.",
    inputSchema: {
      id: z.string().min(1).describe("The ticket id (UUID)."),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async ({ id }) => toolResult(() => apiGetTicket(id)),
);

server.registerTool(
  "inady_kanban_create_ticket",
  {
    title: "Create an inady KANBAN ticket",
    description:
      "Create a new ticket in the To Do column. `title` and `workingDir` are " +
      "required; `workingDir` must be an absolute path to an existing " +
      "directory (the repo the ticket's agents will run in). `description` is " +
      "the markdown body; `memo` is an internal note (e.g. a source URL) that " +
      "is never sent to agent prompts. Returns the new ticket's id.",
    // The zod constraints here are boundary/shape checks that yield clean MCP
    // schema errors. The authoritative rules live once in ticket-core
    // (title non-empty; workingDir absolute+existing via assertValidWorkingDir)
    // and are NOT re-implemented here — this stays a thin front-end.
    inputSchema: {
      title: z.string().min(1).describe("Ticket title (required, non-empty)."),
      workingDir: z
        .string()
        .min(1)
        .describe("Absolute path to an existing repository directory (required)."),
      description: z
        .string()
        .optional()
        .describe("Markdown body shown on the ticket. Optional."),
      memo: z
        .string()
        .optional()
        .describe("Internal note (never sent to agents). Optional."),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  async ({ title, workingDir, description, memo }) =>
    toolResult(() =>
      apiCreateTicket({ title, workingDir, description, memo }),
    ),
);

server.registerTool(
  "inady_kanban_update_ticket",
  {
    title: "Update an inady KANBAN ticket",
    description:
      "Update fields of an existing ticket. Pass the ticket `id` plus any of " +
      "`title`, `description`, `workingDir`; only the fields you include change " +
      "(omitted fields are left untouched). `title` cannot be set empty and " +
      "`workingDir` must be an absolute existing directory. Returns the updated " +
      "ticket. Errors if the id matches no ticket.",
    inputSchema: {
      id: z.string().min(1).describe("The id of the ticket to update (required)."),
      title: z.string().min(1).optional().describe("New title (non-empty)."),
      description: z.string().optional().describe("New markdown body."),
      workingDir: z
        .string()
        .min(1)
        .optional()
        .describe("New absolute working directory (must exist)."),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async ({ id, title, description, workingDir }) =>
    toolResult(() =>
      apiUpdateTicket(id, { title, description, workingDir }),
    ),
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  const target = process.env.INADY_KANBAN_URL ?? serverBaseUrl();
  console.error(`inady-kanban-mcp-server ready — target ${target}`);
}

main().catch((err) => {
  console.error("inady-kanban-mcp-server fatal error:", err);
  process.exit(1);
});
