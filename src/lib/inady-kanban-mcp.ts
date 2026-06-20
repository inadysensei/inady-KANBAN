/**
 * Builds the inady KANBAN MCP server — the four ticket tools registered once and
 * reused by BOTH transports:
 *   - mcp-server.ts wires it to stdio (the classic `npm run mcp` subprocess).
 *   - server.ts mounts it on the already-running board over Streamable HTTP at
 *     `/mcp`, so a client connects to the live server with no subprocess.
 *
 * Like inady-kanban-mcp-client.ts, this holds NO ticket logic: every tool is a
 * thin call through the fetch client to the board's own `/api/tickets` endpoints
 * (→ ticket-core, the single source of truth). Keeping the tool definitions in
 * one factory is precisely what lets the two transports stay one implementation.
 *
 * Server-only: it pulls the MCP SDK. It uses relative imports (the src/lib
 * convention, so it loads under tsx) and is imported solely by the two tsx
 * entrypoints above — never by Next-bundled code — so it stays out of the client
 * bundle.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  apiCreateTicket,
  apiGetTicket,
  apiListTickets,
  apiUpdateTicket,
  type KanbanClientConfig,
} from "./inady-kanban-mcp-client";
import { TICKET_STATUSES, type TicketStatus } from "../db/schema";

// Derive the tool's status enum from the schema's single source of truth so it
// can't drift from the HTTP layer (server.ts validates `?status=` against the
// same TICKET_STATUSES). zod's enum wants a non-empty literal tuple.
const TICKET_STATUS_ENUM = TICKET_STATUSES as [TicketStatus, ...TicketStatus[]];

/** Run a tool body, returning its result as JSON text (or a clear error). */
async function toolResult(
  produce: () => Promise<unknown>,
): Promise<CallToolResult> {
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

/**
 * Build a fully-registered MCP server. `config` is threaded into every tool's
 * HTTP call: the in-process mount (server.ts) passes its own loopback base URL
 * so the board always talks to itself; the stdio entrypoint passes nothing and
 * falls back to `$INADY_KANBAN_URL` / the local server.
 */
export function createMcpServer(config: KanbanClientConfig = {}): McpServer {
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
        "WIP → Done → Ice Box) then by in-column order. Optionally filter to one " +
        "column with `status`. Returns an array of ticket rows (id, title, " +
        "description, status, workingDir, position, timestamps). Use this to find " +
        "a ticket's id before reading or updating it.",
      inputSchema: {
        status: z
          .enum(TICKET_STATUS_ENUM)
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
        const tickets = await apiListTickets(status ? { status } : {}, config);
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
    async ({ id }) => toolResult(() => apiGetTicket(id, config)),
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
        apiCreateTicket({ title, workingDir, description, memo }, config),
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
        apiUpdateTicket(id, { title, description, workingDir }, config),
      ),
  );

  return server;
}
