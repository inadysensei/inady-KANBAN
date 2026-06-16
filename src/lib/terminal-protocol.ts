/**
 * WebSocket message protocol for /ws/terminal/:sessionDbId.
 * Shared by the custom server (server.ts) and the <Terminal> client component.
 * Types + tiny pure parse helpers — no native modules, so it stays safe to
 * import from both the tsx server graph and the Next bundle.
 */

export type ClientMessage =
  | { type: "start"; cols: number; rows: number; resume: boolean }
  | { type: "stdin"; data: string }
  | { type: "resize"; cols: number; rows: number }
  | { type: "kill" };

export type ServerMessage =
  | { type: "ready" }
  | { type: "replay"; data: string }
  | { type: "stdout"; data: string }
  | { type: "exit"; code: number }
  | { type: "error"; message: string };

/** Parse a client→server frame, returning null on malformed JSON. */
export function parseClientMessage(raw: string): ClientMessage | null {
  try {
    return JSON.parse(raw) as ClientMessage;
  } catch {
    return null;
  }
}

/** Parse a server→client frame, returning null on malformed JSON. */
export function parseServerMessage(raw: string): ServerMessage | null {
  try {
    return JSON.parse(raw) as ServerMessage;
  } catch {
    return null;
  }
}
