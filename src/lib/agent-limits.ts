const DEFAULT_MAX_CONCURRENT_AGENTS = 20;

function parseMaxConcurrentAgents(): number {
  const raw = process.env.INADY_KANBAN_MAX_CONCURRENT_AGENTS;
  const n = raw === undefined ? DEFAULT_MAX_CONCURRENT_AGENTS : Number(raw);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_MAX_CONCURRENT_AGENTS;
  return Math.floor(n);
}

/** Max live agent PTYs (spawn only; re-attach does not count). Override via env. */
export const MAX_CONCURRENT_AGENTS = parseMaxConcurrentAgents();

/**
 * Lines of screen + scrollback the server-side mirror keeps per session for
 * re-attach replay (bounds memory at ~this many lines/session, ×20 max). A
 * full-screen TUI on the alternate buffer keeps no scrollback, so in the common
 * case the mirror is roughly screen-sized.
 */
export const SCROLLBACK_MAX_LINES = 5000;

export function concurrentLimitMessage(): string {
  return `At most ${MAX_CONCURRENT_AGENTS} agents can run at once. Stop one first.`;
}
