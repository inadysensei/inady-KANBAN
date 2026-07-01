"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { agentSessions, tickets } from "@/db/schema";
import type { AgentKind } from "@/db/schema";
import {
  MAX_CONCURRENT_AGENTS,
  concurrentLimitMessage,
} from "@/lib/agent-limits";
import {
  parseClineEffort,
  resolveClaudeLaunchOptions,
  resolveMainPrompt,
  type ClaudeEffort,
  type ClaudeModel,
  type ClineEffort,
} from "@/lib/agent-launch";
import {
  readClaudeDefaults,
  readClineDefaults,
  readClineModelSelection,
  readCursorModelSelection,
} from "@/lib/app-settings";
import { defaultCursorModel, resolveCursorModel } from "@/lib/cursor-models";
import { defaultClineModel, resolveClineModel } from "@/lib/cline-models";
import { createChat } from "@/lib/cursor-agent";

export type CreateAgentSessionInput = {
  agent: AgentKind;
  /** User-facing prompt before agent-team wrapping. */
  basePrompt?: string;
  /** Pre-resolved prompt (e.g. re-run of an existing session). */
  mainPrompt?: string;
  agentTeamMembers?: string[];
  claudeModel?: ClaudeModel | string | null;
  claudeEffort?: ClaudeEffort | string | null;
  /** Combined cursor model id (effort baked in); resolved against the
   *  configured default when omitted. */
  cursorModel?: string | null;
  /** Combined clinepass model id; resolved against the configured default when
   *  omitted. */
  clineModel?: string | null;
  /** cline reasoning level (`--thinking`); defaults when omitted. */
  clineEffort?: ClineEffort | string | null;
  /** Launch the CLI in an isolated git worktree (`--worktree`). */
  worktree?: boolean;
};

/**
 * Start a new agent session for a ticket.
 *
 *  1. Pre-issue the conversation UUID — `cursor-agent create-chat` for cursor
 *     (in the ticket's cwd), a locally-generated UUID for claude (pinned later
 *     via --session-id). cline can't pin an id (its --id is resume-only), so it
 *     gets a placeholder UUID here that pty-registry replaces with cline's own
 *     id once it's captured from cline's sessions database after launch.
 *  2. INSERT an agent_sessions row (status='running').
 *  3. Auto-transition the ticket to 'doing' (this is the "execution started" moment).
 *  4. Return the DB id + conversation UUID so the client can open the terminal WebSocket.
 *
 * The PTY itself is started later, when the <Terminal> opens the WebSocket.
 */
export async function createAgentSession(
  ticketId: string,
  opts: CreateAgentSessionInput,
): Promise<{ sessionDbId: string; agentSessionId: string }> {
  const mainPrompt = (
    opts.mainPrompt?.trim() ||
    resolveMainPrompt({
      agent: opts.agent,
      basePrompt: opts.basePrompt ?? "",
      agentTeamMembers: opts.agentTeamMembers ?? [],
    }).trim()
  );
  if (!mainPrompt) throw new Error("main prompt is required");

  const ticket = db
    .select()
    .from(tickets)
    .where(eq(tickets.id, ticketId))
    .get();
  if (!ticket) throw new Error("ticket not found");

  const defaults = readClaudeDefaults();
  const claudeLaunch =
    opts.agent === "claude"
      ? resolveClaudeLaunchOptions({
          model: opts.claudeModel,
          effort: opts.claudeEffort,
          defaultModel: defaults.model,
          defaultEffort: defaults.effort,
        })
      : null;
  const cursorModel =
    opts.agent === "cursor"
      ? resolveCursorModel({
          model: opts.cursorModel,
          defaultModel: defaultCursorModel(readCursorModelSelection()),
        })
      : null;
  const clineModel =
    opts.agent === "cline"
      ? resolveClineModel({
          model: opts.clineModel,
          defaultModel: defaultClineModel(readClineModelSelection()),
        })
      : null;
  // Explicit per-launch effort wins; otherwise fall back to the board default
  // (Settings → Cline default effort), not the bare constant.
  const clineEffort =
    opts.agent === "cline"
      ? opts.clineEffort
        ? parseClineEffort(opts.clineEffort)
        : readClineDefaults().effort
      : null;

  // cursor: may take a moment (talks to the Cursor backend); surfaces a clear
  // error if cursor-agent isn't logged in / on PATH.
  const agentSessionId =
    opts.agent === "cursor"
      ? await createChat(ticket.workingDir)
      : crypto.randomUUID();

  const sessionDbId = crypto.randomUUID();
  const now = Date.now();

  db.transaction((tx) => {
    const runningCount = tx
      .select()
      .from(agentSessions)
      .where(eq(agentSessions.status, "running"))
      .all().length;
    if (runningCount >= MAX_CONCURRENT_AGENTS) {
      throw new Error(concurrentLimitMessage());
    }

    tx.insert(agentSessions)
      .values({
        id: sessionDbId,
        ticketId,
        agent: opts.agent,
        agentSessionId,
        mainPrompt,
        claudeModel: claudeLaunch?.model ?? null,
        claudeEffort: claudeLaunch?.effort ?? null,
        cursorModel,
        clineModel,
        clineEffort,
        worktree: opts.worktree ?? false,
        startedAt: now,
        endedAt: null,
        status: "running",
        exitCode: null,
      })
      .run();
    // Auto Doing transition. Clear doneAt too: starting an agent on a Done
    // ticket pulls it back to Doing, and this is the one status-write that
    // bypasses moveTicket/reorderColumn (the paths that normally clear it).
    tx.update(tickets)
      .set({ status: "doing", updatedAt: now, doneAt: null })
      .where(eq(tickets.id, ticketId))
      .run();
  });

  revalidatePath("/");
  revalidatePath(`/tickets/${ticketId}`);
  return { sessionDbId, agentSessionId };
}

/** Remove a stopped session row. Running sessions must be killed first. */
export async function deleteAgentSession(sessionDbId: string): Promise<void> {
  const session = db
    .select()
    .from(agentSessions)
    .where(eq(agentSessions.id, sessionDbId))
    .get();
  if (!session) throw new Error("session not found");
  if (session.status === "running") {
    throw new Error("cannot delete a running session");
  }

  db.delete(agentSessions)
    .where(eq(agentSessions.id, sessionDbId))
    .run();

  revalidatePath("/");
  revalidatePath(`/tickets/${session.ticketId}`);
}
