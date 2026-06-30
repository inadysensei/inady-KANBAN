"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { createAgentSession, deleteAgentSession } from "@/actions/sessions";
import { deleteTicket, markTicketDone, resumeTicket } from "@/actions/tickets";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type {
  AgentKind,
  AgentSession,
  Editor,
  Tag,
  TeamTemplate,
  Ticket,
  TicketMemo,
} from "@/db/schema";
import { AGENT_KINDS } from "@/db/schema";
import type { ClaudeEffort, ClaudeModel, ClineEffort } from "@/lib/agent-launch";
import type { CursorModelChoices } from "@/lib/cursor-models";
import type { ClineModelChoices } from "@/lib/cline-models";
import { killAgentSession, killTicketSessions } from "@/lib/agent-session-api";
import {
  type DateFormat,
  daysUntil,
  deadlineLabel,
  formatDate,
} from "@/lib/date-format";
import {
  lastSessionStorageKey,
  pickInitialSession,
} from "@/lib/session-restore";
import { STATUS_LABELS } from "@/lib/ticket-display";
import { badgeClass, cardClass } from "@/lib/ui-classes";
import Button from "@/components/ui/Button";
import IconButton from "@/components/ui/IconButton";
import Spinner from "@/components/Spinner";
import {
  CheckIcon,
  DiffIcon,
  EditIcon,
  ICON_SIZE_SM,
  TrashIcon,
} from "@/components/ui/icons";
import DiffPanel from "./DiffPanel";
import MemoSection from "./MemoSection";
import NewAgentPanel from "./NewAgentPanel";
import OpenWithButton from "./OpenWithButton";
import SessionList from "./SessionList";
import TagBadge from "./TagBadge";
import TicketEditForm from "./TicketEditForm";

// xterm touches `document`/`self`, so load the terminal client-side only.
const Terminal = dynamic(() => import("./Terminal"), { ssr: false });

export default function TicketDetailView({
  ticket,
  sessions,
  memos,
  workingDirs,
  editors,
  claudeDefaults,
  cursorModelChoices,
  clineModelChoices,
  clineDefaults,
  teamTemplates,
  agents = AGENT_KINDS,
  initialSessionId,
  dateFormat,
  now,
  allTags,
  tagIds,
}: {
  ticket: Ticket;
  sessions: AgentSession[];
  memos: TicketMemo[];
  workingDirs: string[];
  editors: Editor[];
  claudeDefaults: { model: ClaudeModel; effort: ClaudeEffort };
  cursorModelChoices: CursorModelChoices;
  clineModelChoices: ClineModelChoices;
  clineDefaults: { effort: ClineEffort };
  teamTemplates: TeamTemplate[];
  /** Enabled tools (Settings), in display order. */
  agents?: AgentKind[];
  initialSessionId: string | null;
  dateFormat: DateFormat;
  /** Server render time, for the deadline countdown (see page.tsx). */
  now: number;
  /** All configured tags (the edit-form picker). */
  allTags: Tag[];
  /** The tag ids currently attached to this ticket. */
  tagIds: string[];
}) {
  const router = useRouter();
  const [sessionsState, setSessionsState] = useState(sessions);
  const [active, setActive] = useState<{
    sessionDbId: string;
    resume: boolean;
  } | null>(null);
  const [terminalKey, setTerminalKey] = useState(0);
  const [killingId, setKillingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [rerunningId, setRerunningId] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [doneError, setDoneError] = useState<string | null>(null);
  const [deleting, startDelete] = useTransition();
  const [markingDone, startMarkDone] = useTransition();
  const [editing, setEditing] = useState(false);
  const [diffOpen, setDiffOpen] = useState(false);
  const restoredRef = useRef(false);

  useEffect(() => {
    setSessionsState(sessions);
  }, [sessions]);

  // Auto-open a session on load so the user doesn't have to pick one every
  // visit: a `?session=…` deep-link wins, else the last session opened on this
  // ticket (localStorage), else the most-recent one. New sessions afterwards
  // are opened by openFreshSession/onStarted instead.
  //
  // The page keys this component by ticket id, so a fresh ticket gets a fresh
  // mount (and a fresh `restoredRef`). The boolean guard is still required: the
  // 5s `router.refresh()` poll re-renders with a new `sessions` prop, and
  // without it this effect would re-run and (on the deep-link path) flip
  // `resume` false→true, changing the Terminal key and remounting the live
  // terminal — reconnecting the WebSocket every 5 seconds.
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;

    let storedSessionId: string | null = null;
    try {
      storedSessionId = window.localStorage.getItem(
        lastSessionStorageKey(ticket.id),
      );
    } catch {
      // localStorage can throw (private mode / disabled) — fall through.
    }

    const choice = pickInitialSession({
      urlSessionId: initialSessionId,
      storedSessionId,
      sessionIds: sessions.map((s) => s.id),
    });
    if (!choice) return;

    setActive(choice);
    setTerminalKey(0);
    if (initialSessionId) {
      router.replace(`/tickets/${ticket.id}`, { scroll: false });
    }
  }, [initialSessionId, sessions, ticket.id, router]);

  // Remember the last-opened session per ticket so the next visit restores it.
  useEffect(() => {
    if (!active) return;
    try {
      window.localStorage.setItem(
        lastSessionStorageKey(ticket.id),
        active.sessionDbId,
      );
    } catch {
      // Best-effort; ignore storage failures.
    }
  }, [active, ticket.id]);

  const hasRunning = sessionsState.some((s) => s.status === "running");
  const activeSession = active
    ? (sessionsState.find((s) => s.id === active.sessionDbId) ?? null)
    : null;

  // Re-fetch trigger for the diff panel: a signature over every session that has
  // reached a terminal state. Both ways an agent ends update sessionsState — the
  // active terminal's WS `exit` handler and the SSE-driven router.refresh() that
  // repopulates the `sessions` prop — so when one finishes this string changes
  // and DiffPanel reloads, with no manual refresh.
  const diffSignal = useMemo(
    () =>
      sessionsState
        .filter((s) => s.status !== "running")
        .map((s) => `${s.id}:${s.status}:${s.endedAt ?? ""}`)
        .join("|"),
    [sessionsState],
  );

  // Read-only deadline line for the header (editing happens in TicketEditForm).
  const deadlineDays =
    ticket.deadline != null ? daysUntil(ticket.deadline, now) : null;
  const deadlineTone =
    deadlineDays == null
      ? ""
      : deadlineDays < 0
        ? "text-danger"
        : deadlineDays <= 2
          ? "text-warn"
          : "text-muted";

  // The ticket's tags for the read-only header, in configured tag order.
  const ticketTags = allTags.filter((t) => tagIds.includes(t.id));

  // Mostly redundant with NotificationCenter's SSE-driven refresh, but kept
  // deliberately: the SSE stream has no replay, so this poll covers events
  // missed during reconnect gaps.
  useEffect(() => {
    if (!hasRunning) return;
    const id = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(id);
  }, [hasRunning, router]);

  const handleSessionReady = useCallback((sessionDbId: string) => {
    setSessionsState((prev) =>
      prev.map((s) =>
        s.id === sessionDbId
          ? { ...s, status: "running", exitCode: null, endedAt: null }
          : s,
      ),
    );
  }, []);

  const handleSessionExit = useCallback(
    (sessionDbId: string, exitCode: number) => {
      setSessionsState((prev) =>
        prev.map((s) =>
          s.id === sessionDbId
            ? {
                ...s,
                // A kill also surfaces here as a WS exit(1) — don't let it
                // repaint an already-"killed" row as "error".
                status:
                  s.status === "killed"
                    ? "killed"
                    : exitCode === 0
                      ? "finished"
                      : "error",
                exitCode,
                endedAt: Date.now(),
              }
            : s,
        ),
      );
      router.refresh();
    },
    [router],
  );

  const handleDeleteSession = useCallback(
    async (session: AgentSession) => {
      setSessionError(null);
      setDeletingId(session.id);
      try {
        await deleteAgentSession(session.id);
        setSessionsState((prev) => prev.filter((s) => s.id !== session.id));
        setActive((prev) =>
          prev?.sessionDbId === session.id ? null : prev,
        );
        router.refresh();
      } catch {
        setSessionError("Failed to delete session — try again.");
      } finally {
        setDeletingId(null);
      }
    },
    [router],
  );

  const handleKillSession = useCallback(
    async (session: AgentSession) => {
      setSessionError(null);
      setKillingId(session.id);
      try {
        const ok = await killAgentSession(session.id);
        if (!ok) {
          setSessionError("Failed to stop agent — try again.");
          return;
        }
        setSessionsState((prev) =>
          prev.map((s) =>
            s.id === session.id
              ? { ...s, status: "killed", exitCode: null, endedAt: Date.now() }
              : s,
          ),
        );
        setActive((prev) =>
          prev?.sessionDbId === session.id ? null : prev,
        );
        router.refresh();
      } finally {
        setKillingId(null);
      }
    },
    [router],
  );

  /** Attach the terminal to a just-created session (new agent or re-run). */
  const openFreshSession = useCallback(
    (sessionDbId: string) => {
      setActive({ sessionDbId, resume: false });
      setTerminalKey(0);
      router.refresh();
    },
    [router],
  );

  // The first keystroke into a session terminal = actually resuming work (as
  // opposed to merely opening it to read the transcript), so a parked (WIP)
  // ticket is pulled back into Doing. This is the "resume work" funnel for an
  // existing session — a new/re-run session lands in Doing via
  // createAgentSession instead. Triggering on input (not on open) keeps WIP a
  // glance-safe parking lot and covers both the explicit "open" click and the
  // auto-open-on-load path, since both mount the same Terminal. No-op (and no
  // refresh) unless the ticket is WIP; the server-side guard in resumeTicket
  // stays authoritative against any race with a stale status snapshot.
  const handleResumeWork = useCallback(() => {
    if (ticket.status !== "wip") return;
    void resumeTicket(ticket.id)
      .then(() => router.refresh())
      .catch(() => {
        // Best-effort un-park; the ticket simply stays in WIP on failure.
      });
  }, [ticket.id, ticket.status, router]);

  const handleRerunSession = useCallback(
    async (session: AgentSession) => {
      setSessionError(null);
      setRerunningId(session.id);
      try {
        const { sessionDbId } = await createAgentSession(ticket.id, {
          agent: session.agent,
          mainPrompt: session.mainPrompt,
          claudeModel: session.claudeModel,
          claudeEffort: session.claudeEffort,
          cursorModel: session.cursorModel,
          clineModel: session.clineModel,
          clineEffort: session.clineEffort,
        });
        openFreshSession(sessionDbId);
      } catch (err) {
        setSessionError((err as Error).message);
      } finally {
        setRerunningId(null);
      }
    },
    [openFreshSession, ticket.id],
  );

  const handleMarkDone = useCallback(() => {
    setDoneError(null);
    startMarkDone(async () => {
      const { ok } = await killTicketSessions(ticket.id);
      if (!ok) {
        setDoneError("Failed to stop agents — ticket was not moved to Done.");
        return;
      }
      try {
        await markTicketDone(ticket.id);
        router.refresh();
      } catch (err) {
        setDoneError((err as Error).message);
      }
    });
  }, [ticket.id, router]);

  const handleDeleteTicket = useCallback(() => {
    if (
      !window.confirm(
        `Delete "${ticket.title}"? Running agents on this ticket will be stopped.`,
      )
    ) {
      return;
    }
    startDelete(async () => {
      const { ok } = await killTicketSessions(ticket.id);
      if (!ok) {
        setSessionError("Failed to stop agents — delete cancelled.");
        return;
      }
      await deleteTicket(ticket.id);
      router.push("/");
    });
  }, [ticket.id, ticket.title, router]);

  return (
    <main className="mx-auto grid min-h-screen max-w-[1400px] grid-cols-1 gap-6 p-6 lg:h-screen lg:grid-cols-[minmax(340px,1fr)_minmax(0,2fr)] lg:overflow-hidden">
      <section className="no-scrollbar flex min-w-0 flex-col gap-4 lg:min-h-0 lg:overflow-y-auto lg:overflow-x-hidden">
        <Link
          href="/"
          className="w-fit text-sm text-muted hover:text-fg hover:underline"
        >
          ← inady KANBAN
        </Link>

        <div>
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className={badgeClass("neutral")}>
              {STATUS_LABELS[ticket.status]}
            </span>
            <div className="flex items-center gap-1.5">
              {ticket.status !== "done" && !editing && (
                <Button
                  variant="success"
                  size="sm"
                  disabled={markingDone}
                  aria-busy={markingDone}
                  aria-label={`Mark ticket ${ticket.title} as done`}
                  onClick={handleMarkDone}
                  icon={<CheckIcon size={ICON_SIZE_SM} />}
                >
                  {markingDone ? "Moving…" : "Done"}
                </Button>
              )}
              {!editing && (
                <Button
                  variant="accent"
                  size="sm"
                  aria-label={`Edit ticket ${ticket.title}`}
                  onClick={() => setEditing(true)}
                  icon={<EditIcon size={ICON_SIZE_SM} />}
                >
                  Edit
                </Button>
              )}
              <IconButton
                size="sm"
                tone="danger"
                disabled={deleting}
                aria-busy={deleting}
                aria-label={`Delete ticket ${ticket.title}`}
                onClick={handleDeleteTicket}
              >
                {deleting ? <Spinner /> : <TrashIcon size={ICON_SIZE_SM} />}
              </IconButton>
            </div>
          </div>
          {!editing && (
            <>
              <h1 className="text-xl font-semibold">{ticket.title}</h1>
              <p
                className="mt-1 break-all font-mono text-xs text-muted"
                title={ticket.workingDir}
              >
                {ticket.workingDir}
              </p>
              {deadlineDays != null && ticket.deadline != null && (
                <p className={`mt-1 text-xs font-medium ${deadlineTone}`}>
                  <time dateTime={new Date(ticket.deadline).toISOString()}>
                    Due {formatDate(ticket.deadline, dateFormat)} ·{" "}
                    {deadlineLabel(deadlineDays)}
                  </time>
                </p>
              )}
              {ticketTags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {ticketTags.map((tag) => (
                    <TagBadge key={tag.id} tag={tag} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {editing ? (
          <TicketEditForm
            ticket={ticket}
            workingDirs={workingDirs}
            allTags={allTags}
            tagIds={tagIds}
            onCancel={() => setEditing(false)}
            onSaved={() => {
              setEditing(false);
              router.refresh();
            }}
          />
        ) : (
          ticket.description.trim() && (
            <div className={cardClass("markdown p-3")}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {ticket.description}
              </ReactMarkdown>
            </div>
          )
        )}

        <MemoSection ticketId={ticket.id} memos={memos} />

        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">Sessions</h3>
          {doneError && (
            <p className="text-xs text-danger" role="alert">
              {doneError}
            </p>
          )}
          {sessionError && (
            <p className="text-xs text-danger" role="alert">
              {sessionError}
            </p>
          )}
          <SessionList
            sessions={sessionsState}
            activeSessionId={active?.sessionDbId ?? null}
            killingId={killingId}
            deletingId={deletingId}
            rerunningId={rerunningId}
            onOpen={(s) => setActive({ sessionDbId: s.id, resume: true })}
            onKill={handleKillSession}
            onDelete={handleDeleteSession}
            onRerun={handleRerunSession}
          />
        </div>

        <NewAgentPanel
          ticketId={ticket.id}
          claudeDefaults={claudeDefaults}
          cursorModelChoices={cursorModelChoices}
          clineModelChoices={clineModelChoices}
          clineDefaults={clineDefaults}
          teamTemplates={teamTemplates}
          agents={agents}
          onStarted={openFreshSession}
        />
      </section>

      <section className="flex min-h-0 min-w-0 flex-col gap-2">
        {active ? (
          <>
            <Terminal
              key={`${active.sessionDbId}:${active.resume}:${terminalKey}`}
              sessionDbId={active.sessionDbId}
              resume={active.resume}
              activity={activeSession?.activity ?? null}
              onReady={() => handleSessionReady(active.sessionDbId)}
              onExit={(code) => handleSessionExit(active.sessionDbId, code)}
              onRetry={() => setTerminalKey((k) => k + 1)}
              onFirstInput={handleResumeWork}
              actions={
                <>
                  <Button
                    variant="secondary"
                    size="sm"
                    aria-expanded={diffOpen}
                    aria-controls="ticket-diff-panel"
                    onClick={() => setDiffOpen((v) => !v)}
                    icon={<DiffIcon size={ICON_SIZE_SM} />}
                  >
                    Diff
                  </Button>
                  <OpenWithButton ticketId={ticket.id} editors={editors} />
                </>
              }
            />
            {diffOpen && (
              <DiffPanel
                ticketId={ticket.id}
                refreshSignal={diffSignal}
                onClose={() => setDiffOpen(false)}
              />
            )}
          </>
        ) : (
          <div className="flex min-h-[480px] flex-1 items-center justify-center rounded-lg border border-dashed border-line text-sm text-faint lg:min-h-0">
            Start a new agent or open a session to see the terminal.
          </div>
        )}
      </section>
    </main>
  );
}
