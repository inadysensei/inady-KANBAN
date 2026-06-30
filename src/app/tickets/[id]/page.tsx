import { asc, desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import {
  listEditors,
  listTags,
  listTeamTemplates,
  readTicketTagIds,
  readWorkingDirs,
} from "@/lib/inady-kanban-config";
import TicketDetailView from "@/components/TicketDetailView";
import { db } from "@/db/client";
import { agentSessions, ticketMemos, tickets } from "@/db/schema";
import {
  readAgentTools,
  readClaudeDefaults,
  readClineDefaults,
  readClineModelChoices,
  readCursorModelChoices,
  readDateFormat,
} from "@/lib/app-settings";
import { enabledAgents } from "@/lib/agent-tools";

export const dynamic = "force-dynamic";

export default async function TicketPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ session?: string }>;
}) {
  const { id } = await params;
  const { session: initialSessionId } = await searchParams;

  const ticket = db.select().from(tickets).where(eq(tickets.id, id)).get();
  if (!ticket) notFound();

  const sessions = db
    .select()
    .from(agentSessions)
    .where(eq(agentSessions.ticketId, id))
    .orderBy(desc(agentSessions.startedAt))
    .all();

  const memos = db
    .select()
    .from(ticketMemos)
    .where(eq(ticketMemos.ticketId, id))
    .orderBy(asc(ticketMemos.createdAt))
    .all();

  const workingDirs = readWorkingDirs();
  const editors = listEditors();
  const claudeDefaults = readClaudeDefaults();
  const cursorModelChoices = readCursorModelChoices();
  const clineModelChoices = readClineModelChoices();
  const clineDefaults = readClineDefaults();
  const dateFormat = readDateFormat();
  const agents = enabledAgents(readAgentTools());
  const teamTemplates = listTeamTemplates();
  const allTags = listTags();
  const tagIds = readTicketTagIds(id);
  const validInitialSessionId =
    initialSessionId &&
    sessions.some((session) => session.id === initialSessionId)
      ? initialSessionId
      : null;

  return (
    // Key by ticket id so a ticket→ticket navigation (e.g. a notification click
    // while already on a ticket page) remounts with fresh per-ticket state
    // instead of reusing the previous ticket's `active`/restore guard.
    <TicketDetailView
      key={ticket.id}
      ticket={ticket}
      sessions={sessions}
      memos={memos}
      workingDirs={workingDirs}
      editors={editors}
      claudeDefaults={claudeDefaults}
      cursorModelChoices={cursorModelChoices}
      clineModelChoices={clineModelChoices}
      clineDefaults={clineDefaults}
      teamTemplates={teamTemplates}
      agents={agents}
      initialSessionId={validInitialSessionId}
      dateFormat={dateFormat}
      now={Date.now()}
      allTags={allTags}
      tagIds={tagIds}
    />
  );
}
