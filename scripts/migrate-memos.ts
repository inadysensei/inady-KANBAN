/**
 * One-shot, idempotent migration: copy each ticket's legacy `tickets.memo`
 * text into a `ticket_memos` row, then clear the legacy column so it isn't
 * shown twice. Safe to re-run — skips tickets that already have memo rows.
 *
 *   npx tsx scripts/migrate-memos.ts
 *
 * Run `npm run db:push` first so the `ticket_memos` table exists.
 */
import { eq } from "drizzle-orm";
import { db } from "../src/db/client";
import { ticketMemos, tickets } from "../src/db/schema";

const rows = db
  .select({ id: tickets.id, memo: tickets.memo, createdAt: tickets.createdAt })
  .from(tickets)
  .all()
  .filter((t) => t.memo.trim() !== "");

let migrated = 0;
for (const t of rows) {
  db.transaction((tx) => {
    const existing = tx
      .select({ id: ticketMemos.id })
      .from(ticketMemos)
      .where(eq(ticketMemos.ticketId, t.id))
      .all();
    if (existing.length > 0) {
      // Already has memo rows — clear the legacy column. The legacy text is
      // intentionally dropped here (not appended): this only arises if a ticket
      // somehow held both, which doesn't happen in a one-time cutover.
      tx.update(tickets).set({ memo: "" }).where(eq(tickets.id, t.id)).run();
      return;
    }
    tx.insert(ticketMemos)
      .values({
        id: crypto.randomUUID(),
        ticketId: t.id,
        body: t.memo,
        createdAt: t.createdAt,
        updatedAt: t.createdAt,
      })
      .run();
    tx.update(tickets).set({ memo: "" }).where(eq(tickets.id, t.id)).run();
    migrated += 1;
  });
}

console.log(`migrated ${migrated} legacy memo(s) into ticket_memos`);
