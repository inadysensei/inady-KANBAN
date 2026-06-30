// CJS packages: Node's ESM loader can't see named exports in their minified
// bundles (cjs-module-lexer misses them), so default-import the module object
// for the runtime values and `import type` the classes for annotations — same
// interop pattern as `import Database from "better-sqlite3"` elsewhere.
import xtermSerialize from "@xterm/addon-serialize";
import type { SerializeAddon } from "@xterm/addon-serialize";
import xtermHeadless from "@xterm/headless";
import type { Terminal } from "@xterm/headless";
import { eq } from "drizzle-orm";
import * as pty from "node-pty";
import { db } from "../db/client";
import { agentSessions, tickets } from "../db/schema";
import type { AgentSession, SessionActivity, SessionStatus } from "../db/schema";
import { recordAgentPid, removeAgentPid } from "./agent-pid-store";
import {
  MAX_CONCURRENT_AGENTS,
  SCROLLBACK_MAX_LINES,
  concurrentLimitMessage,
} from "./agent-limits";
import { publishSessionEvent } from "./board-events";
import { serverBaseUrl } from "./server-config";
import { scheduleProcessTermination } from "./process-terminate";
import { AGENT_CLIS } from "./agent-cli";
import { captureClineSessionId } from "./cline-agent";
import {
  parseClaudeEffort,
  parseClaudeModel,
  parseClineEffort,
} from "./agent-launch";
import { wrapPrompt } from "./prompt";

const { Terminal: TerminalCtor } = xtermHeadless;
const { SerializeAddon: SerializeAddonCtor } = xtermSerialize;

export interface PtyHandlers {
  onData: (data: string) => void;
  onExit: (code: number) => void;
  onError: (message: string) => void;
  /** Delivered once, asynchronously, with a snapshot of the reconstructed screen. */
  onReplay: (data: string) => void;
}

export interface LaunchOptions {
  cols: number;
  rows: number;
  /** true when re-opening an existing session (always interactive, no pre-feed). */
  resume: boolean;
}

export type SessionStartResult =
  | { status: "spawned"; connId: number }
  | { status: "attached"; connId: number }
  | { status: "error"; message: string };

const SIGKILL_GRACE_MS = 2000;

interface Attachment {
  connId: number;
  handlers: PtyHandlers;
}

interface SessionSlot {
  proc: pty.IPty;
  attached: Attachment | null;
  /**
   * Server-side mirror of the PTY's terminal. The PTY never re-emits its screen
   * on re-attach (and an idle full-screen TUI won't repaint), so we replay all
   * output into this headless terminal and serialize its current screen for a
   * freshly-mounted xterm — the way tmux/ttyd reconstruct on reconnect.
   */
  term: Terminal;
  serialize: SerializeAddon;
}

function createMirror(cols: number, rows: number): {
  term: Terminal;
  serialize: SerializeAddon;
} {
  const term = new TerminalCtor({
    cols: cols || 80,
    rows: rows || 24,
    scrollback: SCROLLBACK_MAX_LINES,
    allowProposedApi: true,
  });
  const serialize = new SerializeAddonCtor();
  term.loadAddon(serialize);
  return { term, serialize };
}

// In-process map of live PTYs, keyed by agent_sessions.id. Single process, so a
// plain Map is the whole story.
const registry = new Map<string, SessionSlot>();

let nextConnId = 0;

function nextConnectionId(): number {
  return ++nextConnId;
}

export function isRunning(sessionDbId: string): boolean {
  return registry.has(sessionDbId);
}

export function runningCount(): number {
  return registry.size;
}

export function isAttached(sessionDbId: string, connId: number): boolean {
  return registry.get(sessionDbId)?.attached?.connId === connId;
}

function markEnded(
  sessionDbId: string,
  status: SessionStatus,
  exitCode: number | null,
): void {
  db.update(agentSessions)
    // Clear the activity overlay — it only means anything while running.
    .set({ status, exitCode, endedAt: Date.now(), activity: null })
    .where(eq(agentSessions.id, sessionDbId))
    .run();
}

/**
 * Join a session's ticket and broadcast a SessionEvent — the single place that
 * builds the event payload. Skips silently if the ticket row is gone (a
 * cascade-deleted ticket takes its sessions with it). `activity` is omitted for
 * plain status events; the board re-reads a cleared (null) activity via refresh
 * since SessionEvent can only carry "busy"/"awaiting".
 */
function publishForSession(
  session: AgentSession,
  status: SessionStatus,
  exitCode: number | null,
  activity?: SessionActivity,
): void {
  const ticket = db
    .select()
    .from(tickets)
    .where(eq(tickets.id, session.ticketId))
    .get();
  if (!ticket) return;
  publishSessionEvent({
    kind: "session",
    sessionDbId: session.id,
    ticketId: ticket.id,
    ticketTitle: ticket.title,
    agent: session.agent,
    status,
    exitCode,
    activity,
  });
}

/**
 * Record a hook-driven activity transition for a *running* session: the agent
 * resumed work (`"busy"`) or paused for the user (`"awaiting"`). Idempotent — a
 * no-op (and no event) when the activity already matches, so a double-firing
 * hook won't re-notify. `sessionRef` may be our DB id (injected as
 * INADY_KANBAN_SESSION_ID) or the conversation UUID (the hook payload's session_id).
 * Returns false if no matching running session exists.
 */
export function setSessionActivity(
  sessionRef: string,
  activity: SessionActivity,
): boolean {
  const session =
    db
      .select()
      .from(agentSessions)
      .where(eq(agentSessions.id, sessionRef))
      .get() ??
    db
      .select()
      .from(agentSessions)
      .where(eq(agentSessions.agentSessionId, sessionRef))
      .get();
  // The running-only guard is also the barrier against a hook firing just after
  // the PTY exited: markEnded has flipped status off "running", so a late POST
  // 404s instead of resurrecting an activity on an ended session.
  if (!session || session.status !== "running") return false;
  if (session.activity === activity) return true;

  db.update(agentSessions)
    .set({ activity })
    .where(eq(agentSessions.id, session.id))
    .run();

  publishForSession(session, "running", null, activity);
  return true;
}

/**
 * Clear the "your turn" overlay when the user *opens* (attaches to) a running
 * session: opening is the acknowledgement, so the board hint has done its job —
 * otherwise an `awaiting` session keeps its amber badge forever until a `busy`
 * hook fires (and never, for users without that hook). No-op unless the session
 * is running and currently `awaiting`; a `busy` session keeps its spinner. We
 * publish a plain running event (no `activity` field) purely as a refresh
 * trigger — every tab then re-reads the now-null activity from SQLite.
 */
function clearAwaitingActivity(sessionDbId: string): void {
  const session = db
    .select()
    .from(agentSessions)
    .where(eq(agentSessions.id, sessionDbId))
    .get();
  if (!session || session.status !== "running" || session.activity !== "awaiting") {
    return;
  }
  db.update(agentSessions)
    .set({ activity: null })
    .where(eq(agentSessions.id, sessionDbId))
    .run();
  // No `activity` arg → plain running event; every tab re-reads the null.
  publishForSession(session, "running", null);
}

/**
 * Fire-and-forget "killed" broadcast. The kill paths only know the session id,
 * so join the ticket title here; skip silently if either row is gone.
 */
function emitKilledEvent(sessionDbId: string): void {
  const session = db
    .select()
    .from(agentSessions)
    .where(eq(agentSessions.id, sessionDbId))
    .get();
  if (!session) return;
  publishForSession(session, "killed", null);
}

function emitOutput(sessionDbId: string, data: string): void {
  const slot = registry.get(sessionDbId);
  if (!slot || !data) return;
  // Always update the mirror so a later re-attach can reconstruct the screen.
  slot.term.write(data);
  // Forward live only while a terminal is attached; detached output is captured
  // by the mirror above and replayed on the next attach.
  slot.attached?.handlers.onData(data);
}

function attach(
  sessionDbId: string,
  handlers: PtyHandlers,
  kind: "spawned" | "attached",
): SessionStartResult {
  const slot = registry.get(sessionDbId);
  if (!slot) {
    handlers.onError("session is not running");
    return { status: "error", message: "session is not running" };
  }
  if (slot.attached) {
    const message = "session already has an attached terminal — close the other tab first";
    handlers.onError(message);
    return { status: "error", message };
  }
  const connId = nextConnectionId();
  slot.attached = { connId, handlers };
  // Flush the parser, then serialize the reconstructed screen for the new
  // terminal. write("") fires its callback once all prior writes are parsed.
  // The callback is deferred, so live output may reach the client (as stdout)
  // before this snapshot — the client resets on `replay` to keep it
  // authoritative, so a busy reattach self-heals rather than duplicating.
  slot.term.write("", () => {
    // Re-check liveness: the slot may have been detached, replaced, or torn
    // down meanwhile. Teardown deletes the slot *before* disposing `term`, so a
    // registry miss here guarantees we never serialize a disposed terminal.
    const current = registry.get(sessionDbId);
    if (current?.attached?.connId !== connId) return;
    const snapshot = current.serialize.serialize({
      scrollback: SCROLLBACK_MAX_LINES,
    });
    if (snapshot) handlers.onReplay(snapshot);
  });
  return { status: kind, connId };
}

/**
 * Detach a browser connection without stopping the PTY. Only clears the slot if
 * this connection is still the active attachment.
 */
export function detachSession(sessionDbId: string, connId: number): void {
  const slot = registry.get(sessionDbId);
  if (!slot || slot.attached?.connId !== connId) return;
  slot.attached = null;
}

/**
 * Spawn or attach to a `cursor-agent` PTY for the given session.
 *
 * - Not running → spawn (subject to concurrent limit).
 * - Already running → attach (replay a snapshot of the reconstructed screen).
 */
export function startSession(
  sessionDbId: string,
  opts: LaunchOptions,
  handlers: PtyHandlers,
): SessionStartResult {
  const existing = registry.get(sessionDbId);
  if (existing) {
    const result = attach(sessionDbId, handlers, "attached");
    // Opening the session acknowledges any "your turn" badge. Clear only on a
    // real attach — a rejected second tab hasn't actually opened anything.
    if (result.status === "attached") clearAwaitingActivity(sessionDbId);
    return result;
  }

  if (registry.size >= MAX_CONCURRENT_AGENTS) {
    const message = concurrentLimitMessage();
    handlers.onError(message);
    return { status: "error", message };
  }

  const session = db
    .select()
    .from(agentSessions)
    .where(eq(agentSessions.id, sessionDbId))
    .get();
  if (!session) {
    handlers.onError("agent session not found");
    return { status: "error", message: "agent session not found" };
  }
  const ticket = db
    .select()
    .from(tickets)
    .where(eq(tickets.id, session.ticketId))
    .get();
  if (!ticket) {
    handlers.onError("ticket not found");
    return { status: "error", message: "ticket not found" };
  }

  const cli = AGENT_CLIS[session.agent];
  const wrapped = wrapPrompt(ticket.title, ticket.description, session.mainPrompt);
  const args = cli.buildArgs({
    sessionId: session.agentSessionId,
    wrappedPrompt: wrapped,
    resume: opts.resume,
    claudeModel: session.claudeModel
      ? parseClaudeModel(session.claudeModel)
      : undefined,
    claudeEffort: session.claudeEffort
      ? parseClaudeEffort(session.claudeEffort)
      : undefined,
    cursorModel: session.cursorModel ?? undefined,
    clineModel: session.clineModel ?? undefined,
    clineEffort: session.clineEffort
      ? parseClineEffort(session.clineEffort)
      : undefined,
    worktree: session.worktree,
  });

  let proc: pty.IPty;
  try {
    proc = pty.spawn(cli.bin, args, {
      name: "xterm-color",
      cols: opts.cols || 80,
      rows: opts.rows || 24,
      cwd: ticket.workingDir,
      // Expose this session to the agent's hooks so they can POST activity
      // transitions back (see POST /api/agent-sessions/:id/activity/*).
      env: {
        ...(process.env as { [key: string]: string }),
        INADY_KANBAN_SESSION_ID: sessionDbId,
        INADY_KANBAN_URL: serverBaseUrl(),
      },
    });
  } catch (err) {
    handlers.onError(
      `failed to spawn ${cli.bin}: ${(err as Error).message}`,
    );
    markEnded(sessionDbId, "error", null);
    return {
      status: "error",
      message: `failed to spawn ${cli.bin}: ${(err as Error).message}`,
    };
  }

  const slot: SessionSlot = {
    proc,
    attached: null,
    ...createMirror(opts.cols, opts.rows),
  };
  registry.set(sessionDbId, slot);
  recordAgentPid(sessionDbId, proc.pid);

  db.update(agentSessions)
    .set({ status: "running", endedAt: null, exitCode: null, activity: null })
    .where(eq(agentSessions.id, sessionDbId))
    .run();

  // cline mints its own conversation id (its `--id` is resume-only), so the
  // initial launch ran without one. Recover that id from `cline history` and
  // store it as agentSessionId so a later resume can `--id` back into it.
  // Fire-and-forget: never block the terminal opening; on capture failure the
  // placeholder id stays and a resume just starts a fresh conversation.
  if (session.agent === "cline" && !opts.resume) {
    captureClineSessionId({ cwd: ticket.workingDir, prompt: wrapped })
      .then((clineId) => {
        if (clineId) {
          db.update(agentSessions)
            .set({ agentSessionId: clineId })
            .where(eq(agentSessions.id, sessionDbId))
            .run();
        }
      })
      .catch(() => {});
  }

  const publish = (status: SessionStatus, exitCode: number | null) =>
    publishForSession(session, status, exitCode);
  publish("running", null);

  let trustHandled = false;

  proc.onData((data) => {
    if (!trustHandled && cli.trustPromptRe.test(data)) {
      trustHandled = true;
      proc.write(cli.trustAnswer);
    }
    const filtered = cli.filterOutput(data);
    if (filtered) emitOutput(sessionDbId, filtered);
  });

  proc.onExit(({ exitCode }) => {
    const current = registry.get(sessionDbId);
    if (current?.proc !== proc) return;
    const handlers = current.attached?.handlers;
    // Delete before dispose — see the deferred snapshot guard in attach().
    registry.delete(sessionDbId);
    current.term.dispose();
    removeAgentPid(sessionDbId);
    markEnded(sessionDbId, exitCode === 0 ? "finished" : "error", exitCode);
    publish(exitCode === 0 ? "finished" : "error", exitCode);
    handlers?.onExit(exitCode);
  });

  return attach(sessionDbId, handlers, "spawned");
}

export function writeToSession(sessionDbId: string, data: string): void {
  registry.get(sessionDbId)?.proc.write(data);
}

export function resizeSession(
  sessionDbId: string,
  cols: number,
  rows: number,
): void {
  const slot = registry.get(sessionDbId);
  if (!slot) return;
  const c = Math.max(1, cols);
  const r = Math.max(1, rows);
  try {
    slot.proc.resize(c, r);
  } catch {
    // resizing a just-exited pty can throw; harmless.
  }
  // Keep the mirror in lockstep so the next re-attach snapshot matches the PTY.
  slot.term.resize(c, r);
}

/**
 * Stop a session's PTY (if live) and mark the DB row ended. Safe to call from
 * the HTTP kill endpoint when no terminal is attached.
 */
export function killSession(sessionDbId: string): boolean {
  const slot = registry.get(sessionDbId);
  if (slot) {
    const handlers = slot.attached?.handlers;
    // Delete before dispose — see the deferred snapshot guard in attach().
    registry.delete(sessionDbId);
    slot.term.dispose();
    scheduleProcessTermination(slot.proc.pid, SIGKILL_GRACE_MS);
    removeAgentPid(sessionDbId);
    markEnded(sessionDbId, "killed", null);
    emitKilledEvent(sessionDbId);
    handlers?.onExit(1);
    return true;
  }

  const session = db
    .select()
    .from(agentSessions)
    .where(eq(agentSessions.id, sessionDbId))
    .get();
  if (session?.status === "running") {
    markEnded(sessionDbId, "killed", null);
    emitKilledEvent(sessionDbId);
    return true;
  }
  return false;
}

/** Stop every running session (live PTY or DB-only row) for a ticket. */
export function killSessionsForTicket(ticketId: string): number {
  const sessions = db
    .select()
    .from(agentSessions)
    .where(eq(agentSessions.ticketId, ticketId))
    .all();

  let killed = 0;
  for (const session of sessions) {
    if (session.status !== "running" && !registry.has(session.id)) continue;
    if (killSession(session.id)) killed++;
  }
  return killed;
}

/**
 * Boot-time sweep: any `running` rows left over from a previous (crashed)
 * server have no live PTY, so flip them to `error`. Call once before serving.
 */
export function sweepRunningSessions(): number {
  const result = db
    .update(agentSessions)
    .set({ status: "error", endedAt: Date.now(), activity: null })
    .where(eq(agentSessions.status, "running"))
    .run();
  return result.changes;
}
