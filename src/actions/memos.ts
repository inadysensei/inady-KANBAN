"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { ticketMemos, tickets } from "@/db/schema";
import type { TicketMemo } from "@/db/schema";

/** Add a memo to a ticket. Returns the inserted row so the client can append it. */
export async function createMemo(
  ticketId: string,
  body: string,
): Promise<TicketMemo> {
  const text = body.trim();
  if (!text) throw new Error("memo cannot be empty");

  const ticket = db.select().from(tickets).where(eq(tickets.id, ticketId)).get();
  if (!ticket) throw new Error("ticket not found");

  const now = Date.now();
  const memo: TicketMemo = {
    id: crypto.randomUUID(),
    ticketId,
    body: text,
    createdAt: now,
    updatedAt: now,
  };
  db.insert(ticketMemos).values(memo).run();

  revalidatePath(`/tickets/${ticketId}`);
  return memo;
}

/** Edit a memo's body in place. */
export async function updateMemo(memoId: string, body: string): Promise<void> {
  const text = body.trim();
  if (!text) throw new Error("memo cannot be empty");

  const memo = db
    .select()
    .from(ticketMemos)
    .where(eq(ticketMemos.id, memoId))
    .get();
  if (!memo) throw new Error("memo not found");

  db.update(ticketMemos)
    .set({ body: text, updatedAt: Date.now() })
    .where(eq(ticketMemos.id, memoId))
    .run();

  revalidatePath(`/tickets/${memo.ticketId}`);
}

/** Remove a memo. */
export async function deleteMemo(memoId: string): Promise<void> {
  const memo = db
    .select()
    .from(ticketMemos)
    .where(eq(ticketMemos.id, memoId))
    .get();
  // Deliberately idempotent: a missing row (double-click / stale client) is a
  // no-op, not an error — unlike updateMemo, which throws. Nothing changed, so
  // skip revalidation (and ticketId is unknown anyway).
  if (!memo) return;

  db.delete(ticketMemos).where(eq(ticketMemos.id, memoId)).run();

  revalidatePath(`/tickets/${memo.ticketId}`);
}
