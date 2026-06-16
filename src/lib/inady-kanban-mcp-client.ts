/**
 * Thin HTTP client for the Kanban server's ticket endpoints. The MCP server
 * (mcp-server.ts) is intentionally NOT a second implementation of ticket logic:
 * it is just an MCP-protocol front-end that translates each tool call into a
 * request against the same `/api/tickets` endpoints the board itself exposes
 * (server.ts), which in turn call the single source of truth in ticket-core.ts.
 * So there is exactly one implementation of "how a ticket is created/updated/
 * read"; MCP, API and logic cannot drift apart.
 *
 * Everything here is pure request-building + response/error-shaping with `fetch`
 * injected (so it unit-tests without a live server, like the other src/lib
 * helpers). No drizzle/node-pty — relative imports only, loads anywhere.
 */
import type { Ticket, TicketStatus } from "../db/schema";
import { serverBaseUrl } from "./server-config";

export interface KanbanClientConfig {
  /** Override the server base URL (else `$INADY_KANBAN_URL`, else the local server). */
  baseUrl?: string;
  /** Inject a `fetch` implementation (tests pass a fake; prod uses global). */
  fetchImpl?: typeof fetch;
}

export interface CreateTicketArgs {
  title: string;
  description?: string;
  memo?: string;
  workingDir: string;
}

export interface UpdateTicketArgs {
  title?: string;
  description?: string;
  workingDir?: string;
}

function resolveBaseUrl(baseUrl?: string): string {
  return baseUrl ?? process.env.INADY_KANBAN_URL ?? serverBaseUrl();
}

interface RequestSpec {
  method: "GET" | "POST" | "PATCH";
  path: string;
  body?: unknown;
}

/**
 * Issue one request and unwrap the shared `{ ok, ... }` envelope all the ticket
 * endpoints return. Maps the three failure modes to clear, actionable errors:
 * the server being down (fetch rejects), a non-JSON reply, and an
 * `{ ok: false, error }` / non-2xx response.
 */
async function kanbanRequest<T>(
  config: KanbanClientConfig,
  { method, path, body }: RequestSpec,
): Promise<T> {
  const base = resolveBaseUrl(config.baseUrl);
  const doFetch = config.fetchImpl ?? fetch;
  const url = `${base}${path}`;

  let res: Response;
  try {
    res = await doFetch(url, {
      method,
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Could not reach the Kanban server at ${base}. Is it running (npm run dev)? (${detail})`,
    );
  }

  let payload: unknown;
  try {
    payload = await res.json();
  } catch {
    throw new Error(
      `Kanban server returned a non-JSON response (HTTP ${res.status}) for ${method} ${path}.`,
    );
  }

  const env = payload as { ok?: boolean; error?: unknown };
  if (!res.ok || env?.ok === false) {
    const message =
      typeof env?.error === "string" ? env.error : `HTTP ${res.status}`;
    throw new Error(message);
  }
  return payload as T;
}

/** Create a `todo` ticket via POST /api/tickets; returns its id. */
export async function apiCreateTicket(
  input: CreateTicketArgs,
  config: KanbanClientConfig = {},
): Promise<{ id: string }> {
  const payload = await kanbanRequest<{ ok: true; id: string }>(config, {
    method: "POST",
    path: "/api/tickets",
    body: input,
  });
  return { id: payload.id };
}

/** Fetch a single ticket via GET /api/tickets/:id. */
export async function apiGetTicket(
  id: string,
  config: KanbanClientConfig = {},
): Promise<Ticket> {
  const payload = await kanbanRequest<{ ok: true; ticket: Ticket }>(config, {
    method: "GET",
    path: `/api/tickets/${encodeURIComponent(id)}`,
  });
  return payload.ticket;
}

/** List tickets via GET /api/tickets, optionally filtered by status. */
export async function apiListTickets(
  filter: { status?: TicketStatus } = {},
  config: KanbanClientConfig = {},
): Promise<Ticket[]> {
  const query = filter.status
    ? `?status=${encodeURIComponent(filter.status)}`
    : "";
  const payload = await kanbanRequest<{ ok: true; tickets: Ticket[] }>(config, {
    method: "GET",
    path: `/api/tickets${query}`,
  });
  return payload.tickets;
}

/** Update an existing ticket's fields via PATCH /api/tickets/:id. */
export async function apiUpdateTicket(
  id: string,
  patch: UpdateTicketArgs,
  config: KanbanClientConfig = {},
): Promise<Ticket> {
  const payload = await kanbanRequest<{ ok: true; ticket: Ticket }>(config, {
    method: "PATCH",
    path: `/api/tickets/${encodeURIComponent(id)}`,
    body: patch,
  });
  return payload.ticket;
}
