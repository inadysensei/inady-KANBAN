export type LiveAgentCount = { live: number; max: number };

export type KillTicketResult = { ok: boolean; killed: number };

/** Live PTY count from the server-process registry. */
export async function fetchLiveAgentCount(): Promise<LiveAgentCount | null> {
  try {
    const res = await fetch("/api/agent-sessions/live-count");
    if (!res.ok) return null;
    return (await res.json()) as LiveAgentCount;
  } catch {
    return null;
  }
}

/** Stop a running agent (live PTY or DB-only "running" row). Server-process only. */
export async function killAgentSession(sessionDbId: string): Promise<boolean> {
  try {
    const res = await fetch(
      `/api/agent-sessions/${encodeURIComponent(sessionDbId)}/kill`,
      { method: "POST" },
    );
    if (!res.ok) return false;
    const body = (await res.json()) as { ok?: boolean };
    return body.ok === true;
  } catch {
    return false;
  }
}

/** Stop every running session for a ticket. Call before delete or Done. */
export async function killTicketSessions(
  ticketId: string,
): Promise<KillTicketResult> {
  try {
    const res = await fetch(
      `/api/tickets/${encodeURIComponent(ticketId)}/kill-sessions`,
      { method: "POST" },
    );
    if (!res.ok) return { ok: false, killed: 0 };
    const body = (await res.json()) as { ok?: boolean; killed?: number };
    return { ok: body.ok === true, killed: body.killed ?? 0 };
  } catch {
    return { ok: false, killed: 0 };
  }
}
