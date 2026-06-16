/**
 * Which session a freshly-loaded ticket page should auto-open, and how, so the
 * user doesn't have to pick one on every visit.
 *
 * Priority:
 *   1. A `?session=…` deep-link (validated server-side) — opened fresh
 *      (`resume:false`); a supported entry point for linking straight to a
 *      specific session.
 *   2. The last session the user opened on this ticket (persisted in
 *      localStorage) — re-opened (`resume:true`), exactly as clicking it does.
 *   3. The most-recent session (the page provides ids ordered `startedAt desc`),
 *      so the board still auto-opens something on the first-ever visit.
 *
 * Stale ids (e.g. a since-deleted session) fall through to the next option.
 * Returns null only when the ticket has no sessions to open.
 */
export function pickInitialSession({
  urlSessionId,
  storedSessionId,
  sessionIds,
}: {
  urlSessionId: string | null;
  storedSessionId: string | null;
  sessionIds: string[];
}): { sessionDbId: string; resume: boolean } | null {
  if (urlSessionId && sessionIds.includes(urlSessionId)) {
    return { sessionDbId: urlSessionId, resume: false };
  }
  if (storedSessionId && sessionIds.includes(storedSessionId)) {
    return { sessionDbId: storedSessionId, resume: true };
  }
  const [mostRecent] = sessionIds;
  if (mostRecent) {
    return { sessionDbId: mostRecent, resume: true };
  }
  return null;
}

/** localStorage key holding the last-opened session id for a ticket. */
export const lastSessionStorageKey = (ticketId: string): string =>
  `inady-kanban:last-session:${ticketId}`;
