import { ticketMatchesTags, type TagChip } from "./tags";
import type {
  SessionActivity,
  SessionStatus,
  Ticket,
  TicketStatus,
} from "../db/schema";

export type Update = { id: string; status: TicketStatus; position: number };

/**
 * Per-ticket agent-session tally: one bucket per status, plus the hook-reported
 * subsets of `running` — `busy` (agent working → spinner) and `awaiting` (agent
 * paused for the user → "your turn"). `running` stays the live total; the
 * remainder (running - busy - awaiting) is "unknown" (no hook configured) and
 * renders the classic green dot.
 */
export interface SessionStatusCounts {
  running: number;
  busy: number;
  awaiting: number;
  finished: number;
  error: number;
  killed: number;
}

/** Fold grouped `(ticketId, status, activity, count)` rows into a zero-filled
 *  per-ticket tally — pure, so the server page can build it and client cards
 *  can read it. A ticket's `running` may arrive as up to three rows (busy /
 *  awaiting / unknown), so statuses accumulate. */
export function tallySessionCounts(
  rows: readonly {
    ticketId: string;
    status: SessionStatus;
    activity: SessionActivity | null;
    count: number;
  }[],
): Record<string, SessionStatusCounts> {
  const tally: Record<string, SessionStatusCounts> = {};
  for (const row of rows) {
    const counts = (tally[row.ticketId] ??= {
      running: 0,
      busy: 0,
      awaiting: 0,
      finished: 0,
      error: 0,
      killed: 0,
    });
    counts[row.status] += row.count;
    if (row.status === "running" && row.activity) {
      counts[row.activity] += row.count;
    }
  }
  return tally;
}

/** Display order for the Done column: recency, not position. Most recently
 *  updated first; ties broken by createdAt desc, then id, for determinism. */
export function orderDoneColumn(tickets: Ticket[]): Ticket[] {
  return [...tickets].sort(
    (a, b) =>
      b.updatedAt - a.updatedAt ||
      b.createdAt - a.createdAt ||
      a.id.localeCompare(b.id),
  );
}

/** The plan a drag produces: either a single fractional move, or a full-column
 *  integer renumber when neighbors got too tight. */
export type DragResult =
  | { kind: "move"; update: Update }
  | { kind: "reorder"; status: TicketStatus; orderedIds: string[]; updates: Update[] };

/** Below this neighbor gap, fractional positions have drifted too far — renumber. */
export const MIN_GAP = 1e-6;

/** Dependency-free arrayMove (same semantics as @dnd-kit/sortable's), so this
 *  module stays pure and loads in a node test env without pulling in React. */
function arrayMove<T>(items: T[], from: number, to: number): T[] {
  const next = items.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

function findTicket(
  groups: Record<TicketStatus, Ticket[]>,
  id: string,
): Ticket | undefined {
  for (const status of Object.keys(groups) as TicketStatus[]) {
    const found = groups[status].find((t) => t.id === id);
    if (found) return found;
  }
  return undefined;
}

/** Group tickets into per-status columns, each sorted by ascending position. */
export function groupByStatus(
  tickets: Ticket[],
  statuses: readonly TicketStatus[],
): Record<TicketStatus, Ticket[]> {
  const groups = Object.fromEntries(
    statuses.map((s) => [s, [] as Ticket[]]),
  ) as Record<TicketStatus, Ticket[]>;
  for (const t of [...tickets].sort((a, b) => a.position - b.position)) {
    groups[t.status].push(t);
  }
  return groups;
}

/**
 * Pure planner for a drag-end: given the per-status columns (sorted, as produced
 * by groupByStatus) and the dragged/over ids, decide the resulting status +
 * fractional position — or a full renumber when neighbors collide. Returns null
 * for any no-op (drop on self, unknown active, same slot).
 *
 * `overId` is either a column id (a status key — a column-level drop) or a
 * ticket id (drop relative to that card).
 */
export function computeDragResult(
  groups: Record<TicketStatus, Ticket[]>,
  activeId: string,
  overId: string,
): DragResult | null {
  if (activeId === overId) return null;

  const activeTicket = findTicket(groups, activeId);
  if (!activeTicket) return null;

  const fromStatus = activeTicket.status;
  const overIsColumn = overId in groups;
  const toStatus: TicketStatus = overIsColumn
    ? (overId as TicketStatus)
    : (findTicket(groups, overId)?.status ?? fromStatus);

  // Build the target column's resulting order.
  let ordered: Ticket[];
  if (fromStatus === toStatus) {
    const col = groups[toStatus];
    const oldIndex = col.findIndex((t) => t.id === activeId);
    const newIndex = overIsColumn
      ? col.length - 1
      : col.findIndex((t) => t.id === overId);
    if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return null;
    ordered = arrayMove(col, oldIndex, newIndex);
  } else {
    const col = groups[toStatus]; // does not contain active
    const insertAt = overIsColumn
      ? col.length
      : Math.max(0, col.findIndex((t) => t.id === overId));
    ordered = [...col.slice(0, insertAt), activeTicket, ...col.slice(insertAt)];
  }

  const pos = ordered.findIndex((t) => t.id === activeId);
  const prev = ordered[pos - 1];
  const next = ordered[pos + 1];

  // Neighbors too tight (fractional drift) → renumber the whole column.
  if (prev && next && next.position - prev.position < MIN_GAP) {
    return {
      kind: "reorder",
      status: toStatus,
      orderedIds: ordered.map((t) => t.id),
      updates: ordered.map((t, i) => ({
        id: t.id,
        status: toStatus,
        position: i + 1,
      })),
    };
  }

  let newPosition: number;
  if (prev && next) newPosition = (prev.position + next.position) / 2;
  else if (next) newPosition = next.position - 1;
  else if (prev) newPosition = prev.position + 1;
  else newPosition = 1;

  return {
    kind: "move",
    update: { id: activeId, status: toStatus, position: newPosition },
  };
}

/**
 * The board's instant-filter state: a title/dir search string and the set of tag
 * ids clicked on cards (OR-matched — see ticketMatchesTags). The two combine
 * with AND. This is a pure render-time narrow over the columns — it never
 * touches DnD ordering or the Done recency sort, so clearing it restores the
 * original board exactly. Held in Board state, applied via narrowColumn just
 * before each column renders.
 */
export interface BoardFilter {
  query: string;
  activeTagIds: readonly string[];
}

/** Case-insensitive substring of the title or working dir. Empty query (after
 *  trim) matches everything, so an unset search box hides nothing. */
export function ticketMatchesQuery(
  ticket: Pick<Ticket, "title" | "workingDir">,
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    ticket.title.toLowerCase().includes(q) ||
    ticket.workingDir.toLowerCase().includes(q)
  );
}

/** Whether either filter is set — drives the "Clear all" affordance and lets
 *  narrowColumn short-circuit to the identity (original board). */
export function isBoardFilterActive(filter: BoardFilter): boolean {
  return filter.query.trim() !== "" || filter.activeTagIds.length > 0;
}

/**
 * Narrow one rendered column by the AND of both filters. When no filter is
 * active it returns the *same array reference* (the board is shown untouched —
 * DnD order and Done recency intact). Side data (per-ticket tags) is passed in
 * so this stays pure and node-testable.
 */
export function narrowColumn(
  tickets: Ticket[],
  filter: BoardFilter,
  side: {
    ticketTags: Record<string, TagChip[]>;
  },
): Ticket[] {
  if (!isBoardFilterActive(filter)) return tickets;
  return tickets.filter(
    (t) =>
      ticketMatchesQuery(t, filter.query) &&
      ticketMatchesTags(
        (side.ticketTags[t.id] ?? []).map((c) => c.id),
        filter.activeTagIds,
      ),
  );
}
