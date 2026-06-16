"use client";

import type { AgentSession } from "@/db/schema";
import { AGENT_LOGOS } from "@/lib/agent-display";
import { formatDuration, promptFirstLine } from "@/lib/session-display";
import SessionStatusIndicator from "@/components/SessionStatusIndicator";
import Spinner from "@/components/Spinner";
import IconButton from "@/components/ui/IconButton";
import {
  ICON_SIZE_SM,
  RerunIcon,
  StopIcon,
  TrashIcon,
} from "@/components/ui/icons";

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString();
}

export default function SessionList({
  sessions,
  activeSessionId,
  killingId,
  deletingId,
  rerunningId,
  onOpen,
  onKill,
  onDelete,
  onRerun,
}: {
  sessions: AgentSession[];
  activeSessionId: string | null;
  killingId: string | null;
  deletingId: string | null;
  rerunningId: string | null;
  onOpen: (session: AgentSession) => void;
  onKill: (session: AgentSession) => void;
  onDelete: (session: AgentSession) => void;
  onRerun: (session: AgentSession) => void;
}) {
  if (sessions.length === 0) {
    return <p className="text-xs text-muted">No agent sessions yet.</p>;
  }

  return (
    <ul className="flex flex-col gap-1">
      {sessions.map((s) => {
        const label = promptFirstLine(s.mainPrompt) || s.agentSessionId.slice(0, 8);
        return (
          <li key={s.id} className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onOpen(s)}
              title={s.mainPrompt}
              className={`flex min-w-0 flex-1 items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${
                activeSessionId === s.id
                  ? "border-accent bg-accent/10"
                  : "border-line"
              }`}
            >
              <SessionStatusIndicator status={s.status} activity={s.activity} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={AGENT_LOGOS[s.agent]}
                alt={s.agent}
                title={s.agent}
                className="h-3.5 w-3.5 shrink-0"
              />
              <span className="min-w-0 flex-1 truncate text-fg">{label}</span>
              {s.status === "running" && activeSessionId !== s.id && (
                <span className="shrink-0 rounded bg-ok/15 px-1 text-[10px] text-ok">
                  background
                </span>
              )}
              <span className="shrink-0 text-faint" suppressHydrationWarning>
                {formatTime(s.startedAt)}
              </span>
              {s.status !== "running" && s.endedAt !== null && (
                <span className="shrink-0 text-faint">
                  · {formatDuration(s.startedAt, s.endedAt)}
                </span>
              )}
              {s.exitCode !== null && (
                <span className="shrink-0 text-faint">· exit {s.exitCode}</span>
              )}
            </button>
            {s.status === "running" ? (
              <IconButton
                size="sm"
                tone="danger"
                className="shrink-0"
                disabled={killingId === s.id}
                aria-busy={killingId === s.id}
                aria-label={`Stop agent: ${label}`}
                onClick={() => onKill(s)}
              >
                {killingId === s.id ? <Spinner /> : <StopIcon size={ICON_SIZE_SM} />}
              </IconButton>
            ) : (
              <>
                <IconButton
                  size="sm"
                  className="shrink-0"
                  disabled={rerunningId !== null}
                  aria-busy={rerunningId === s.id}
                  aria-label={`Re-run session: ${label}`}
                  onClick={() => onRerun(s)}
                >
                  {rerunningId === s.id ? (
                    <Spinner />
                  ) : (
                    <RerunIcon size={ICON_SIZE_SM} />
                  )}
                </IconButton>
                <IconButton
                  size="sm"
                  tone="danger"
                  className="shrink-0"
                  disabled={deletingId === s.id}
                  aria-busy={deletingId === s.id}
                  aria-label={`Delete session: ${label}`}
                  onClick={() => onDelete(s)}
                >
                  {deletingId === s.id ? (
                    <Spinner />
                  ) : (
                    <TrashIcon size={ICON_SIZE_SM} />
                  )}
                </IconButton>
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}
