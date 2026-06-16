/**
 * Custom-server address, in one place. Both the server bind (server.ts) and the
 * hook URL injected into agent PTYs (pty-registry.ts) must agree on the port, so
 * the literal lives here rather than being duplicated.
 */

/** Port the custom server listens on. */
export const SERVER_PORT = Number(process.env.PORT || 7373);

/**
 * Base URL agent hooks POST back to (e.g. `…/api/agent-sessions/:id/activity/*`).
 * Always `localhost` (loopback) on purpose: hooks run on this same host, so the
 * server's bind HOST is irrelevant to reaching it.
 */
export function serverBaseUrl(): string {
  return `http://localhost:${SERVER_PORT}`;
}
