import { asc, count, desc, eq, notInArray } from "drizzle-orm";
import {
  listTags,
  listTaskTemplates,
  readTicketTags,
  readWorkingDirs,
} from "@/lib/inady-kanban-config";
import AppHeader from "@/components/AppHeader";
import Board from "@/components/Board";
import NewTicketForm from "@/components/NewTicketForm";
import RunningAgentsBadge from "@/components/RunningAgentsBadge";
import TaskTemplateBar from "@/components/TaskTemplateBar";
import { db } from "@/db/client";
import { agentSessions, tickets } from "@/db/schema";
import { readDateFormat } from "@/lib/app-settings";
import { tallySessionCounts } from "@/lib/board-order";

// Always read fresh from SQLite; revalidatePath in the actions keeps this in sync.
export const dynamic = "force-dynamic";

/** The Done column only shows the most recently updated tickets. */
const DONE_LIMIT = 10;

export default function HomePage() {
  // The board shows the four working columns. Done is fetched separately
  // (latest N + a total); Ice Box is collapsed to just `iceboxTotal` below.
  const active = db
    .select()
    .from(tickets)
    .where(notInArray(tickets.status, ["done", "icebox"]))
    .orderBy(asc(tickets.position))
    .all();
  const done = db
    .select()
    .from(tickets)
    .where(eq(tickets.status, "done"))
    .orderBy(desc(tickets.updatedAt))
    .limit(DONE_LIMIT)
    .all();
  const doneTotal =
    db
      .select({ value: count() })
      .from(tickets)
      .where(eq(tickets.status, "done"))
      .get()?.value ?? 0;
  // Ice Box is count-only on the board (its tickets live on /icebox).
  const iceboxTotal =
    db
      .select({ value: count() })
      .from(tickets)
      .where(eq(tickets.status, "icebox"))
      .get()?.value ?? 0;

  // Per-ticket agent status badges: one grouped query, folded into a record.
  const sessionCounts = tallySessionCounts(
    db
      .select({
        ticketId: agentSessions.ticketId,
        status: agentSessions.status,
        activity: agentSessions.activity,
        count: count(),
      })
      .from(agentSessions)
      .groupBy(
        agentSessions.ticketId,
        agentSessions.status,
        agentSessions.activity,
      )
      .all(),
  );

  const workingDirs = readWorkingDirs();
  const taskTemplates = listTaskTemplates();
  const dateFormat = readDateFormat();
  const allTags = listTags();
  // ticketId → its tag chips, threaded alongside sessionCounts (same shape).
  const ticketTags = readTicketTags();
  // Captured once on the server render and passed down so the deadline
  // countdown is identical between SSR and hydration (no clock read in the
  // client card); refreshes whenever the board re-renders.
  const now = Date.now();

  return (
    <main className="mx-auto flex w-full min-h-screen max-w-[1400px] flex-col gap-4 overflow-x-hidden p-6">
      <AppHeader title="inady KANBAN">
        <div className="flex items-center gap-3">
          <RunningAgentsBadge />
          <NewTicketForm workingDirs={workingDirs} tags={allTags} />
        </div>
      </AppHeader>
      <TaskTemplateBar templates={taskTemplates} />
      <Board
        tickets={[...active, ...done]}
        sessionCounts={sessionCounts}
        ticketTags={ticketTags}
        allTags={allTags}
        doneTotal={doneTotal}
        iceboxTotal={iceboxTotal}
        dateFormat={dateFormat}
        now={now}
      />
    </main>
  );
}
