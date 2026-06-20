"use server";

import { eq, inArray, max, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { TICKET_STATUSES, tickets } from "@/db/schema";
import type { TicketStatus } from "@/db/schema";
import { computeDragResult, groupByStatus } from "@/lib/board-order";
import { insertTicket, setTicketTags, updateTicketFields } from "@/lib/ticket-core";

export async function createTicket(input: {
  title: string;
  description: string;
  memo?: string;
  workingDir: string;
  deadline?: number | null;
  tagIds?: string[];
}): Promise<{ id: string }> {
  // Ticket-insert logic lives in src/lib/ticket-core so the POST /api/tickets
  // endpoint (server.ts) creates tickets the exact same way.
  const result = await insertTicket(input);
  revalidatePath("/");
  return result;
}

export async function updateTicket(
  id: string,
  patch: {
    title?: string;
    description?: string;
    workingDir?: string;
    deadline?: number | null;
    tagIds?: string[];
  },
): Promise<void> {
  // Field updates go through ticket-core (shared with PATCH /api/tickets/:id and
  // thus the MCP server). Memos are edited via their own actions (memos.ts); the
  // legacy `tickets.memo` column is unused (kept only to avoid a destructive
  // drop).
  await updateTicketFields(id, {
    title: patch.title,
    description: patch.description,
    workingDir: patch.workingDir,
    deadline: patch.deadline,
  });
  // `undefined` leaves tags untouched; an array (even empty) replaces the set.
  if (patch.tagIds !== undefined) setTicketTags(id, patch.tagIds);
  revalidatePath("/");
  revalidatePath(`/tickets/${id}`);
}

/**
 * Resuming work on a parked (WIP) ticket pulls it back into Doing. Called when
 * the user re-opens an existing agent session from the ticket page — the other
 * "execution started" funnel (a new/re-run session) already lands in Doing via
 * createAgentSession. No-op for any other status, so opening a session to merely
 * read a Done ticket's transcript won't un-complete it, and a passive auto-open
 * on page load (which doesn't call this) leaves a parked ticket parked.
 */
export async function resumeTicket(id: string): Promise<void> {
  const ticket = db.select().from(tickets).where(eq(tickets.id, id)).get();
  if (!ticket || ticket.status !== "wip") return;
  db.update(tickets)
    .set({ status: "doing", updatedAt: Date.now() })
    .where(eq(tickets.id, id))
    .run();
  revalidatePath("/");
  revalidatePath(`/tickets/${id}`);
}

/**
 * The `done_at` value to write for a status transition. When the target is Done,
 * stamp `now` only on the *transition* into Done — `tickets.status` in an UPDATE
 * SET reads the pre-update value, so a row that was already Done keeps its date
 * (real or legacy null) untouched. This matters for `reorderColumn`, which
 * renumbers the whole Done column: it must not fabricate a `now` for the
 * pre-existing, intentionally-null Done tickets. `coalesce` additionally guards
 * a re-entering ticket's own earlier date. Any non-Done target clears it.
 */
function doneAtFor(status: TicketStatus, now: number) {
  return status === "done"
    ? sql`CASE WHEN ${tickets.status} <> 'done' THEN coalesce(${tickets.doneAt}, ${now}) ELSE ${tickets.doneAt} END`
    : null;
}

export async function moveTicket(
  id: string,
  toStatus: TicketStatus,
  toPosition: number,
): Promise<void> {
  const now = Date.now();
  db.update(tickets)
    .set({
      status: toStatus,
      position: toPosition,
      updatedAt: now,
      doneAt: doneAtFor(toStatus, now),
    })
    .where(eq(tickets.id, id))
    .run();
  revalidatePath("/");
}

/**
 * Revive an Ice Box ticket: move it to the end of To Do (max To Do position + 1).
 * The Ice Box is a count-only column with no order, so there's no source slot to
 * preserve — the ticket simply lands after the last To Do card. Mirrors a board
 * drag's status write but also revalidates /icebox so the list page drops the
 * row. No-op (and no revalidate) for a ticket that isn't in the Ice Box, so the
 * /icebox button can't yank an already-active ticket around.
 */
export async function moveTicketToTodo(id: string): Promise<void> {
  const ticket = db.select().from(tickets).where(eq(tickets.id, id)).get();
  if (!ticket || ticket.status !== "icebox") return;

  const now = Date.now();
  const maxPosition =
    db
      .select({ value: max(tickets.position) })
      .from(tickets)
      .where(eq(tickets.status, "todo"))
      .get()?.value ?? 0;
  db.update(tickets)
    .set({
      status: "todo",
      position: maxPosition + 1,
      updatedAt: now,
      doneAt: doneAtFor("todo", now),
    })
    .where(eq(tickets.id, id))
    .run();
  revalidatePath("/");
  revalidatePath("/icebox");
}

/** Renumber a column to integer positions 1..n (rebalance / explicit reorder). */
export async function reorderColumn(
  status: TicketStatus,
  orderedIds: string[],
): Promise<void> {
  const now = Date.now();
  db.transaction((tx) => {
    orderedIds.forEach((id, i) => {
      tx.update(tickets)
        .set({
          status,
          position: i + 1,
          updatedAt: now,
          doneAt: doneAtFor(status, now),
        })
        .where(eq(tickets.id, id))
        .run();
    });
  });
  revalidatePath("/");
}

/** Move a ticket to Done using the same position math as a board drag. */
export async function markTicketDone(id: string): Promise<void> {
  const ticket = db.select().from(tickets).where(eq(tickets.id, id)).get();
  if (!ticket) throw new Error("ticket not found");
  if (ticket.status === "done") return;

  const related = db
    .select()
    .from(tickets)
    .where(inArray(tickets.status, [ticket.status, "done"]))
    .all();
  const groups = groupByStatus(related, TICKET_STATUSES);
  const result = computeDragResult(groups, id, "done");
  if (!result) throw new Error("could not move ticket to Done");

  if (result.kind === "move") {
    await moveTicket(
      result.update.id,
      result.update.status,
      result.update.position,
    );
  } else {
    await reorderColumn(result.status, result.orderedIds);
  }

  revalidatePath(`/tickets/${id}`);
}

export async function deleteTicket(id: string): Promise<void> {
  // agent_sessions rows cascade-delete (FK ON DELETE CASCADE). Callers must
  // POST /api/tickets/:id/kill-sessions first — this action cannot reach PTYs.
  db.delete(tickets).where(eq(tickets.id, id)).run();
  // Refresh both ticket-listing views — a ticket may be deleted from the board
  // or from the Ice Box list.
  revalidatePath("/");
  revalidatePath("/icebox");
}
