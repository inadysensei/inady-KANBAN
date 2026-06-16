import { EventEmitter } from "node:events";
import type { AgentKind, SessionActivity, SessionStatus } from "../db/schema";

/** Broadcast whenever an agent session changes state anywhere on the server. */
export interface SessionEvent {
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

const SESSION_EVENT = "session";

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
  getEmitter().emit(SESSION_EVENT, event);
}

/** Subscribe to session events. Returns an unsubscribe function. */
export function subscribeSessionEvents(
  listener: (event: SessionEvent) => void,
): () => void {
  const emitter = getEmitter();
  emitter.on(SESSION_EVENT, listener);
  return () => {
    emitter.off(SESSION_EVENT, listener);
  };
}
