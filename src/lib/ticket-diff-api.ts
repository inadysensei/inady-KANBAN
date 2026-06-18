import type { DiffPayload, DiffStatus } from "./diff-view";

/**
 * Client fetch for the in-board diff panel — the browser-side counterpart to
 * GET /api/tickets/:id/diff (server.ts → collectTicketDiff). Same philosophy as
 * agent-session-api.ts: a thin typed wrapper, no React.
 *
 * Returns a normalized DiffPayload. A failed HTTP status (404/400/500) is folded
 * into `status: "error"` so the caller has one shape to render. An aborted fetch
 * rejects with AbortError as usual — the caller drops it in its effect cleanup.
 */
export async function fetchTicketDiff(
  ticketId: string,
  signal?: AbortSignal,
): Promise<DiffPayload> {
  const res = await fetch(
    `/api/tickets/${encodeURIComponent(ticketId)}/diff`,
    { signal },
  );
  if (!res.ok) {
    let error = `Diff request failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) error = body.error;
    } catch {
      // Non-JSON error body — keep the status-code message.
    }
    return { status: "error", diff: "", truncated: false, untracked: [], error };
  }
  const body = (await res.json()) as Partial<DiffPayload>;
  // Narrow the wire value to a known status (loopback, so this is belt-and-
  // suspenders): anything unexpected reads as "error" rather than silently
  // falling through DiffPanel's exhaustive branches to an empty state.
  const status: DiffStatus =
    body.status === "ok" || body.status === "not-applicable"
      ? body.status
      : "error";
  return {
    status,
    diff: body.diff ?? "",
    truncated: body.truncated ?? false,
    untracked: body.untracked ?? [],
    error: body.error,
  };
}
