import { randomUUID } from "node:crypto";
import { eq, max, sql } from "drizzle-orm";
import { db } from "../db/client";
import { TICKET_STATUSES, tags, ticketMemos, ticketTags, tickets } from "../db/schema";
import type { Ticket, TicketStatus } from "../db/schema";
import { publishTicketEvent } from "./board-events";
import { resolveTagIds } from "./tags";
import { assertValidWorkingDir } from "./working-dirs";

export interface CreateTicketInput {
  title: string;
  description?: string;
  memo?: string;
  workingDir: string;
  /** Optional deadline as a local-midnight epoch (see tickets.deadline). */
  deadline?: number | null;
  /** Tag ids to attach. Unknown ids are silently skipped (ticket still created). */
  tagIds?: string[];
}

/**
 * Insert a new `todo` ticket (and an optional memo) and return its id. This is
 * the single source of truth for "how a ticket is created": both the
 * createTicket Server Action (src/actions/tickets.ts) and the POST /api/tickets
 * endpoint in server.ts call it, so a board click and an external API caller
 * (e.g. an import script feeding the HTTP API) produce identical rows.
 *
 * Lives in src/lib (relative imports, no next/cache) so it loads in both module
 * graphs — Next's bundle and the tsx-run custom server. Status is always
 * `todo`; position = max(todo position) + 1; the memo flows into a
 * `ticket_memos` row (NOT the legacy `tickets.memo` column). Does NOT call
 * revalidatePath — request-context callers (the action) do that themselves; but
 * it DOES publish a `TicketEvent` on the shared board bus so *other* open tabs
 * auto-refresh (revalidatePath only updates the acting tab). Co-locating the
 * broadcast here — the single create path — is why a board click, the HTTP API,
 * and the MCP all reach other tabs without each remembering to publish.
 */
export async function insertTicket(
  input: CreateTicketInput,
): Promise<{ id: string }> {
  const title = input.title.trim();
  if (!title) throw new Error("title is required");
  const workingDir = input.workingDir.trim();
  await assertValidWorkingDir(workingDir);

  const now = Date.now();
  const last = db
    .select({ p: max(tickets.position) })
    .from(tickets)
    .where(eq(tickets.status, "todo"))
    .get();
  const position = (last?.p ?? 0) + 1;

  const id = randomUUID();
  const memo = input.memo?.trim() ?? "";
  db.transaction((tx) => {
    tx.insert(tickets)
      .values({
        id,
        title,
        description: input.description ?? "",
        status: "todo",
        workingDir,
        position,
        createdAt: now,
        updatedAt: now,
        deadline: input.deadline ?? null,
      })
      .run();
    if (memo) {
      tx.insert(ticketMemos)
        .values({
          id: randomUUID(),
          ticketId: id,
          body: memo,
          createdAt: now,
          updatedAt: now,
        })
        .run();
    }
    attachTags(tx, id, input.tagIds ?? []);
  });

  publishTicketEvent({ kind: "ticket", ticketId: id, action: "created" });
  return { id };
}

/** A drizzle handle (the db singleton or an open transaction). */
type Runner = Pick<typeof db, "select" | "insert" | "delete">;

/**
 * Attach the matching subset of `tagIds` to a ticket. Unknown ids are dropped
 * (resolveTagIds), so an external caller passing a stale/typo'd tag id still
 * gets a ticket — the unmatched tag is simply skipped. Runs on the caller's
 * transaction so it's atomic with the ticket insert.
 */
function attachTags(tx: Runner, ticketId: string, tagIds: string[]): void {
  if (tagIds.length === 0) return;
  const existingIds = tx.select({ id: tags.id }).from(tags).all();
  const matched = resolveTagIds(
    tagIds,
    existingIds.map((r) => r.id),
  );
  if (matched.length === 0) return;
  tx.insert(ticketTags)
    .values(matched.map((tagId) => ({ ticketId, tagId })))
    .run();
}

/**
 * Replace a ticket's tags with the matching subset of `tagIds` (unknown ids
 * dropped), in one transaction. Used by the edit form via the updateTicket
 * action.
 */
export function setTicketTags(ticketId: string, tagIds: string[]): void {
  db.transaction((tx) => {
    tx.delete(ticketTags).where(eq(ticketTags.ticketId, ticketId)).run();
    attachTags(tx, ticketId, tagIds);
  });
}

/**
 * Ticket memos whose body contains `query` as a literal, case-insensitive
 * substring (LIKE wildcards in the query are escaped so `%`/`_` match
 * literally); with no query, every memo. Backs the generic GET /api/memos
 * search endpoint — a plain "search notes" capability with no caller-specific
 * knowledge. (An external importer can use it to find an already-imported item
 * by searching for a source id or URL it stored in a memo, but extracting that
 * identifier is the importer's concern, not the board's.) Reads only
 * `ticket_memos` (the legacy `tickets.memo` column is unused).
 */
export function searchMemos(
  query?: string,
): { ticketId: string; body: string }[] {
  const cols = { ticketId: ticketMemos.ticketId, body: ticketMemos.body };
  const q = query?.trim();
  if (!q) return db.select(cols).from(ticketMemos).all();
  const pattern = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  return db
    .select(cols)
    .from(ticketMemos)
    .where(sql`${ticketMemos.body} LIKE ${pattern} ESCAPE '\\'`)
    .all();
}

/** A single ticket by id, or undefined if none. */
export function getTicket(id: string): Ticket | undefined {
  return db.select().from(tickets).where(eq(tickets.id, id)).get();
}

/**
 * Tickets, optionally filtered by status, ordered the way the board reads
 * top-to-bottom: by column (todo → doing → wip → done → icebox) then by
 * in-column `position`. Like `getTicket` this is the single read path the GET
 * /api/tickets endpoints (and thus the MCP server) share with any in-process
 * caller.
 */
export function listTickets(filter?: { status?: TicketStatus }): Ticket[] {
  const rows = filter?.status
    ? db.select().from(tickets).where(eq(tickets.status, filter.status)).all()
    : db.select().from(tickets).all();
  return [...rows].sort(
    (a, b) =>
      TICKET_STATUSES.indexOf(a.status) - TICKET_STATUSES.indexOf(b.status) ||
      a.position - b.position,
  );
}

/** Fields of a ticket that can be edited after creation. */
export interface UpdateTicketFieldsInput {
  title?: string;
  description?: string;
  workingDir?: string;
  /** `null` clears the deadline; `undefined` leaves it untouched. */
  deadline?: number | null;
}

/**
 * The single source of truth for "how a ticket's editable fields change":
 * builds the partial UPDATE (only the keys present in `patch`), validates them
 * (title non-empty, workingDir absolute+existing), and returns the row after
 * the write (undefined if `id` matched nothing). The updateTicket Server Action
 * wraps this (+ tag replacement + revalidatePath); the PATCH /api/tickets/:id
 * endpoint (server.ts) calls it directly — so the board edit form and an MCP
 * client update tickets through the exact same logic. Tags are a separate
 * concern, handled by setTicketTags. Does NOT call revalidatePath, but — like
 * insertTicket — publishes a `TicketEvent` (only when a row actually matched) so
 * other open tabs auto-refresh.
 */
export async function updateTicketFields(
  id: string,
  patch: UpdateTicketFieldsInput,
): Promise<Ticket | undefined> {
  const set: Record<string, unknown> = { updatedAt: Date.now() };
  if (patch.title !== undefined) {
    const t = patch.title.trim();
    if (!t) throw new Error("title cannot be empty");
    set.title = t;
  }
  if (patch.description !== undefined) set.description = patch.description;
  if (patch.workingDir !== undefined) {
    const wd = patch.workingDir.trim();
    await assertValidWorkingDir(wd);
    set.workingDir = wd;
  }
  if (patch.deadline !== undefined) set.deadline = patch.deadline;

  db.update(tickets).set(set).where(eq(tickets.id, id)).run();
  const updated = getTicket(id);
  if (updated) {
    publishTicketEvent({ kind: "ticket", ticketId: id, action: "updated" });
  }
  return updated;
}
