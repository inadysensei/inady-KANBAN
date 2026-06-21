import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import next from "next";
import { WebSocket, WebSocketServer } from "ws";
import { MAX_CONCURRENT_AGENTS } from "./src/lib/agent-limits";
import { createMcpServer } from "./src/lib/inady-kanban-mcp";
import { SERVER_PORT, serverBaseUrl } from "./src/lib/server-config";
import {
  bootstrapDefaults,
  migrateLegacyTicketStatuses,
} from "./src/lib/bootstrap";
import { subscribeBoardEvents } from "./src/lib/board-events";
import { CURSOR_AGENT_BIN } from "./src/lib/cursor-agent";
import { collectTicketDiff } from "./src/lib/git-diff";
import { sweepOrphanAgentProcesses } from "./src/lib/orphan-agent-cleanup";
import {
  detachSession,
  isAttached,
  killSession,
  killSessionsForTicket,
  resizeSession,
  runningCount,
  setSessionActivity,
  startSession,
  sweepRunningSessions,
  writeToSession,
} from "./src/lib/pty-registry";
import {
  parseClientMessage,
  type ServerMessage,
} from "./src/lib/terminal-protocol";
import {
  getTicket,
  insertTicket,
  listTickets,
  searchMemos,
  updateTicketFields,
} from "./src/lib/ticket-core";
import { TICKET_STATUSES } from "./src/db/schema";
import type { TicketStatus } from "./src/db/schema";

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOST || "localhost";
const port = SERVER_PORT;

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

const TERMINAL_PATH_RE = /^\/ws\/terminal\/([^/?]+)/;
const KILL_PATH_RE = /^\/api\/agent-sessions\/([^/]+)\/kill$/;
const ACTIVITY_PATH_RE =
  /^\/api\/agent-sessions\/([^/]+)\/activity\/(awaiting|busy)$/;
const KILL_TICKET_PATH_RE = /^\/api\/tickets\/([^/]+)\/kill-sessions$/;
const CREATE_TICKET_PATH = "/api/tickets";
// Single ticket by id: GET to read, PATCH to update. The `[^/]+` (no trailing
// segment) keeps this from matching `/api/tickets/:id/kill-sessions`.
const TICKET_ID_PATH_RE = /^\/api\/tickets\/([^/]+)$/;
// Working-dir diff for the in-board review panel: GET runs `git diff HEAD`.
const TICKET_DIFF_PATH_RE = /^\/api\/tickets\/([^/]+)\/diff$/;
// Generic ticket-memo ("note") search — see the GET handler below.
const MEMOS_PATH = "/api/memos";
const LIVE_COUNT_PATH = "/api/agent-sessions/live-count";
const EVENTS_PATH = "/api/events";
// MCP over Streamable HTTP — the same tools as `npm run mcp` (stdio), served by
// the already-running board so a client connects with no subprocess.
const MCP_PATH = "/mcp";
const SSE_HEARTBEAT_MS = 30_000;
// Cap request bodies so a runaway/garbage POST can't buffer unbounded memory.
const MAX_BODY_BYTES = 1_000_000;

function send(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

/** Collect a request body as a UTF-8 string, rejecting if it exceeds the cap. */
function readBody(req: import("node:http").IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    let bytes = 0;
    req.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > MAX_BODY_BYTES) {
        reject(new Error("request body too large"));
        req.destroy();
        return;
      }
      body += chunk.toString("utf8");
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

/**
 * Shared preamble for the external JSON write endpoints (create-ticket POST,
 * ticket PATCH): read the size-capped body and JSON-parse it. On failure it
 * writes the response itself — 413 for an oversize body, 400 for invalid JSON,
 * with the same `{ ok: false, error }` shape both scripts parse — and returns
 * null, so the caller must `return` immediately. On success returns the parsed
 * value boxed (so a JSON `null` body is distinguishable from the failure
 * sentinel).
 */
async function readJsonBody(
  req: import("node:http").IncomingMessage,
  res: import("node:http").ServerResponse,
): Promise<{ value: unknown } | null> {
  let raw: string;
  try {
    raw = await readBody(req);
  } catch {
    // readBody only rejects on the size cap (or a socket error).
    res.writeHead(413, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: "request body too large" }));
    return null;
  }
  try {
    return { value: JSON.parse(raw) };
  } catch {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: "invalid JSON body" }));
    return null;
  }
}

/** Best-effort warning if cursor-agent isn't logged in. Never crashes the server. */
function checkCursorAgentAuth(): void {
  let child;
  try {
    child = spawn(CURSOR_AGENT_BIN, ["status"], { env: process.env });
  } catch (err) {
    console.warn(
      `[warn] could not run \`${CURSOR_AGENT_BIN}\` (${(err as Error).message}). Is the Cursor CLI installed and on PATH?`,
    );
    return;
  }
  let out = "";
  child.stdout?.on("data", (d) => (out += d.toString()));
  child.stderr?.on("data", (d) => (out += d.toString()));
  child.on("error", () => {
    console.warn(
      `[warn] could not run \`${CURSOR_AGENT_BIN}\`. Is the Cursor CLI installed and on PATH?`,
    );
  });
  child.on("close", () => {
    if (/not logged in|please log in|unauthenticated/i.test(out)) {
      console.warn(
        "[warn] cursor-agent may not be logged in. Run `cursor-agent login` on this host.",
      );
    }
  });
}

/**
 * Handle one MCP request on `/mcp` over Streamable HTTP. Stateless: a fresh
 * server + transport per request (no session state to track for a single-user
 * tool), so GET/DELETE — which only make sense against a live session stream —
 * get a 405. `enableJsonResponse` returns plain JSON instead of an SSE stream,
 * which keeps simple clients (and curl) happy. The transport reads the request
 * body itself, so the caller must NOT pre-consume it (and the shared
 * `MAX_BODY_BYTES` cap doesn't apply here — acceptable for a localhost
 * single-user tool). The in-process server talks to itself over loopback
 * (serverBaseUrl), so an MCP edit flows through the same `/api/tickets` →
 * ticket-core path as every other writer.
 */
async function handleMcpRequest(
  req: import("node:http").IncomingMessage,
  res: import("node:http").ServerResponse,
): Promise<void> {
  if (req.method !== "POST") {
    res.writeHead(405, { "Content-Type": "application/json", Allow: "POST" });
    res.end(
      JSON.stringify({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Method Not Allowed: use POST." },
        id: null,
      }),
    );
    return;
  }

  const server = createMcpServer({ baseUrl: serverBaseUrl() });
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  // Tear down the per-request server + transport once the response closes.
  res.on("close", () => {
    void transport.close();
    void server.close();
  });
  // A mid-write socket error must not surface as an unhandled 'error' and crash
  // the process (cleanup runs on 'close') — same guard the SSE endpoint uses.
  res.on("error", () => {});
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res);
  } catch (err) {
    console.error("[mcp] request error:", err);
    if (!res.headersSent && !res.writableEnded && !res.destroyed) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error." },
          id: null,
        }),
      );
    }
  }
}

app.prepare().then(() => {
  const seeded = bootstrapDefaults();
  if (seeded.repositories > 0 || seeded.editors > 0 || seeded.tags > 0) {
    console.log(
      `[boot] seeded defaults: ${seeded.repositories} repo(s), ${seeded.editors} editor(s), ${seeded.tags} tag(s)`,
    );
  }
  // Fold any legacy `review` tickets into Doing (the Review column was removed).
  try {
    const migrated = migrateLegacyTicketStatuses();
    if (migrated > 0) {
      console.log(`[boot] migrated ${migrated} review ticket(s) -> doing`);
    }
  } catch (err) {
    console.warn(
      `[boot] could not migrate ticket statuses (${(err as Error).message}). Run \`npm run db:push\`.`,
    );
  }
  const orphans = sweepOrphanAgentProcesses();
  if (orphans > 0) {
    console.log(`[boot] killed ${orphans} orphan cursor-agent process(es)`);
  }
  const swept = sweepRunningSessions();
  if (swept > 0) {
    console.log(`[boot] swept ${swept} stale running session(s) -> error`);
  }
  checkCursorAgentAuth();

  // Must be obtained AFTER prepare() — Next throws otherwise.
  const upgradeHandler =
    typeof app.getUpgradeHandler === "function"
      ? app.getUpgradeHandler()
      : null;

  const server = createServer((req, res) => {
    const { pathname, searchParams } = new URL(
      req.url || "/",
      `http://${hostname}`,
    );

    const killMatch = KILL_PATH_RE.exec(pathname);
    if (killMatch && req.method === "POST") {
      const sessionDbId = decodeURIComponent(killMatch[1]);
      const ok = killSession(sessionDbId);
      res.writeHead(ok ? 200 : 404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok }));
      return;
    }

    // Hook-driven activity transitions: the agent's lifecycle hooks POST here to
    // flip the session between "busy" (working) and "awaiting" (the user's turn).
    const activityMatch = ACTIVITY_PATH_RE.exec(pathname);
    if (activityMatch && req.method === "POST") {
      const sessionRef = decodeURIComponent(activityMatch[1]);
      // Regex constrains group 2 to exactly "awaiting" | "busy".
      const activity = activityMatch[2] as "awaiting" | "busy";
      const ok = setSessionActivity(sessionRef, activity);
      res.writeHead(ok ? 200 : 404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok }));
      return;
    }

    const killTicketMatch = KILL_TICKET_PATH_RE.exec(pathname);
    if (killTicketMatch && req.method === "POST") {
      const ticketId = decodeURIComponent(killTicketMatch[1]);
      const killed = killSessionsForTicket(ticketId);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, killed }));
      return;
    }

    // Create a ticket from outside the Next app (e.g. an import script) without
    // touching SQLite directly — same code path as the createTicket Server
    // Action via insertTicket(). Does not revalidatePath (no request context
    // here), so open boards need a reload to see it.
    if (pathname === CREATE_TICKET_PATH && req.method === "POST") {
      void (async () => {
        const parsed = await readJsonBody(req, res);
        if (!parsed) return;
        const body = (parsed.value ?? {}) as Record<string, unknown>;
        try {
          const { id } = await insertTicket({
            title: typeof body.title === "string" ? body.title : "",
            description:
              typeof body.description === "string" ? body.description : "",
            memo: typeof body.memo === "string" ? body.memo : "",
            workingDir:
              typeof body.workingDir === "string" ? body.workingDir : "",
            // Tag ids by which to label the ticket. Non-string entries are
            // ignored; ids that don't match a tag are dropped by insertTicket
            // (the ticket is still created).
            tagIds: Array.isArray(body.tagIds)
              ? body.tagIds.filter((t): t is string => typeof t === "string")
              : [],
          });
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true, id }));
          // insertTicket already broadcast a TicketEvent on the board bus, so
          // open boards auto-refresh (this endpoint has no revalidatePath).
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error }));
        }
      })();
      return;
    }

    // List tickets (optionally `?status=todo|doing|wip|done`), for external
    // readers like the inady KANBAN MCP server. Reads through the shared listTickets()
    // in ticket-core, so the board page and the MCP see the same rows/ordering.
    if (pathname === CREATE_TICKET_PATH && req.method === "GET") {
      const status = searchParams.get("status");
      if (status !== null && !TICKET_STATUSES.includes(status as TicketStatus)) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            ok: false,
            error: `status must be one of ${TICKET_STATUSES.join(", ")}`,
          }),
        );
        return;
      }
      try {
        const list = listTickets(
          status ? { status: status as TicketStatus } : undefined,
        );
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, tickets: list }));
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error }));
      }
      return;
    }

    // Search ticket memos ("notes") by literal substring (`?q=`), or list them
    // all when `q` is omitted. A generic capability with no caller-specific
    // logic: an external importer can extract a source id itself and ask "does
    // any memo already contain it?" — the board just searches text.
    if (pathname === MEMOS_PATH && req.method === "GET") {
      try {
        const memos = searchMemos(searchParams.get("q") ?? undefined);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, memos }));
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error }));
      }
      return;
    }

    // In-board diff review: run `git diff HEAD` (+ untracked files) on the
    // ticket's working dir. The server's first git integration — collectTicketDiff
    // keeps node:child_process out of the client/Server-Action bundles, no-ops
    // on non-git dirs (status "not-applicable"), and byte-caps the payload.
    const diffMatch = TICKET_DIFF_PATH_RE.exec(pathname);
    if (diffMatch && req.method === "GET") {
      let id: string;
      try {
        id = decodeURIComponent(diffMatch[1]);
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "invalid ticket id" }));
        return;
      }
      void (async () => {
        try {
          const ticket = getTicket(id);
          if (!ticket) {
            res.writeHead(404, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: false, error: "ticket not found" }));
            return;
          }
          const payload = await collectTicketDiff(ticket.workingDir);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true, ...payload }));
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error }));
        }
      })();
      return;
    }

    // Read one ticket (GET) or update its fields (PATCH) by id — the MCP
    // server's get/update tools land here. Both go through ticket-core, the same
    // logic the board uses. PATCH does not revalidatePath (no request context),
    // so open boards need a reload to reflect an MCP edit.
    const ticketIdMatch = TICKET_ID_PATH_RE.exec(pathname);
    if (ticketIdMatch && (req.method === "GET" || req.method === "PATCH")) {
      // `new URL` leaves malformed %-escapes in the pathname, so decode can
      // throw URIError here — in the raw server callback (no outer catch) that
      // would crash the process. Guard it into a 400, like the sibling routes
      // turn their failures into JSON errors rather than letting them escape.
      let id: string;
      try {
        id = decodeURIComponent(ticketIdMatch[1]);
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "invalid ticket id" }));
        return;
      }

      if (req.method === "GET") {
        try {
          const ticket = getTicket(id);
          if (!ticket) {
            res.writeHead(404, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: false, error: "ticket not found" }));
            return;
          }
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true, ticket }));
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error }));
        }
        return;
      }

      void (async () => {
        const parsed = await readJsonBody(req, res);
        if (!parsed) return;
        const body = (parsed.value ?? {}) as Record<string, unknown>;
        try {
          // Only forward the keys actually present, so an omitted field stays
          // untouched (matching updateTicketFields' partial-update contract).
          const patch: {
            title?: string;
            description?: string;
            workingDir?: string;
            deadline?: number | null;
          } = {};
          if (typeof body.title === "string") patch.title = body.title;
          if (typeof body.description === "string")
            patch.description = body.description;
          if (typeof body.workingDir === "string")
            patch.workingDir = body.workingDir;
          if (body.deadline === null || typeof body.deadline === "number")
            patch.deadline = body.deadline;

          const ticket = await updateTicketFields(id, patch);
          if (!ticket) {
            res.writeHead(404, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: false, error: "ticket not found" }));
            return;
          }
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true, ticket }));
          // updateTicketFields already broadcast a TicketEvent — open boards
          // refresh over the bus (this endpoint has no revalidatePath).
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error }));
        }
      })();
      return;
    }

    if (pathname === LIVE_COUNT_PATH && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({ live: runningCount(), max: MAX_CONCURRENT_AGENTS }),
      );
      return;
    }

    // Server-Sent Events: broadcast agent session state changes to every tab.
    if (pathname === EVENTS_PATH && req.method === "GET") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      });
      // Events and heartbeats fire at arbitrary times; between the socket
      // dying and `close` running cleanup, an unguarded write would emit an
      // unhandled 'error' (ERR_STREAM_DESTROYED) and crash the process.
      const writeFrame = (chunk: string) => {
        if (!res.destroyed && !res.writableEnded) res.write(chunk);
      };
      res.on("error", () => {
        // client went away mid-write — cleanup runs on 'close'
      });
      writeFrame(": connected\n\n");

      const unsubscribe = subscribeBoardEvents((event) => {
        writeFrame(`data: ${JSON.stringify(event)}\n\n`);
      });
      // Keep intermediaries (and EventSource itself) from timing out the stream.
      const heartbeat = setInterval(() => {
        writeFrame(": ping\n\n");
      }, SSE_HEARTBEAT_MS);

      res.on("close", () => {
        clearInterval(heartbeat);
        unsubscribe();
      });
      return;
    }

    if (pathname === MCP_PATH) {
      void handleMcpRequest(req, res);
      return;
    }

    handle(req, res);
  });

  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    const { pathname } = new URL(req.url || "/", "http://localhost");
    const match = TERMINAL_PATH_RE.exec(pathname);
    if (match) {
      const sessionDbId = decodeURIComponent(match[1]);
      wss.handleUpgrade(req, socket, head, (ws) => {
        handleTerminal(ws, sessionDbId);
      });
    } else if (upgradeHandler) {
      // Hand everything else (Next's HMR socket /_next/webpack-hmr) back to
      // Next. Do NOT socket.destroy() here — that breaks dev fast-refresh.
      upgradeHandler(req, socket, head);
    }
  });

  server.listen(port, () => {
    console.log(`> inady KANBAN ready on http://${hostname}:${port}`);
  });
});

function handleTerminal(ws: WebSocket, sessionDbId: string): void {
  let started = false;
  let connId: number | null = null;

  ws.on("message", (raw) => {
    const msg = parseClientMessage(raw.toString());
    if (!msg) return;

    switch (msg.type) {
      case "start": {
        if (started) return;
        started = true;
        const result = startSession(
          sessionDbId,
          { cols: msg.cols, rows: msg.rows, resume: msg.resume },
          {
            onData: (data) => send(ws, { type: "stdout", data }),
            onExit: (code) => {
              send(ws, { type: "exit", code });
              ws.close();
            },
            onError: (message) => send(ws, { type: "error", message }),
            onReplay: (data) => send(ws, { type: "replay", data }),
          },
        );
        if (result.status === "error") {
          ws.close();
          return;
        }
        connId = result.connId;
        send(ws, { type: "ready" });
        break;
      }
      case "stdin":
        if (connId !== null && isAttached(sessionDbId, connId)) {
          writeToSession(sessionDbId, msg.data);
        }
        break;
      case "resize": {
        if (connId !== null && isAttached(sessionDbId, connId)) {
          resizeSession(sessionDbId, msg.cols, msg.rows);
        }
        break;
      }
      case "kill":
        if (connId !== null && isAttached(sessionDbId, connId)) {
          killSession(sessionDbId);
        }
        break;
    }
  });

  ws.on("error", (err) => {
    console.warn(`[ws] terminal ${sessionDbId} error:`, err.message);
  });

  ws.on("close", () => {
    // Detach only — the PTY keeps running in the background until exit or kill.
    if (connId !== null) detachSession(sessionDbId, connId);
  });
}
