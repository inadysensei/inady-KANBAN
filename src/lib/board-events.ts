import { EventEmitter } from "node:events";
import type { AgentKind, SessionActivity, SessionStatus } from "../db/schema";

/** Broadcast whenever an agent session changes state anywhere on the server. */
export interface SessionEvent {
  kind: "session";
  sessionDbId: string;
  ticketId: string;
  ticketTitle: string;
  agent: AgentKind;
  status: SessionStatus;
  exitCode: number | null;
  /**
   * Present on hook-driven *activity* transitions (status stays "running"):
   * "busy" when the agent resumed work, "awaiting" when it paused for the user.
   * Undefined on plain status events.
   */
  activity?: SessionActivity;
}

/**
 * Broadcast when a ticket is created/updated server-side (MCP / HTTP API /
 * external script) — writes that don't go through a Server Action's
 * `revalidatePath`, so the open board would otherwise silently go stale. The
 * client just refreshes the route on these; they never feed the
 * notification/unread-badge math (that stays session-only).
 */
export interface TicketEvent {
  kind: "ticket";
  ticketId: string;
  action: "created" | "updated";
}

/** Anything broadcast on the board event bus. Discriminated by `kind`. */
export type BoardEvent = SessionEvent | TicketEvent;

const BOARD_EVENT = "board";

// The custom server (tsx) and Next's bundled Server Actions are two module
// graphs in the SAME process. Cache the emitter on globalThis so both share one
// event bus — same pattern as the db handle in src/db/client.ts.
const globalForEvents = globalThis as unknown as {
  __inadyKanbanBoardEvents?: EventEmitter;
};

function getEmitter(): EventEmitter {
  if (!globalForEvents.__inadyKanbanBoardEvents) {
    const emitter = new EventEmitter();
    // One listener per open SSE connection — no fixed cap.
    emitter.setMaxListeners(0);
    globalForEvents.__inadyKanbanBoardEvents = emitter;
  }
  return globalForEvents.__inadyKanbanBoardEvents;
}

export function publishSessionEvent(event: SessionEvent): void {
  getEmitter().emit(BOARD_EVENT, event);
}

export function publishTicketEvent(event: TicketEvent): void {
  getEmitter().emit(BOARD_EVENT, event);
}

/** Subscribe to every board event (session + ticket). Returns an unsubscribe fn. */
export function subscribeBoardEvents(
  listener: (event: BoardEvent) => void,
): () => void {
  const emitter = getEmitter();
  emitter.on(BOARD_EVENT, listener);
  return () => {
    emitter.off(BOARD_EVENT, listener);
  };
}
