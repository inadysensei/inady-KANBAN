import type { AgentKind, SessionActivity, SessionStatus } from "../db/schema";
import type { SessionStatusCounts } from "./board-order";

/**
 * Human-facing agent/session display metadata shared by client components.
 * No React, no node APIs — and deliberately NOT in agent-cli.ts, which pulls
 * node:child_process and must never enter the client bundle.
 */

export const AGENT_LABELS: Record<AgentKind, string> = {
  cursor: "Cursor",
  claude: "Claude",
  cline: "Cline",
};

/** Official logo marks served from public/logos/. */
export const AGENT_LOGOS: Record<AgentKind, string> = {
  cursor: "/logos/cursor.svg",
  claude: "/logos/claude.svg",
  cline: "/logos/cline.svg",
};

/**
 * How a session reads at a glance:
 * - `spinner` only when a hook has confirmed the agent is actively working
 *   (motion = "working, wait").
 * - `badge`   a colored dot for every other state — the classic green/red/etc.
 *   process status, or the amber "your turn" overlay.
 *
 * `needsAttention` is reserved for the awaiting-input overlay (the one state
 * that wants the user to act now), so cards can make it prominent.
 */
export interface SessionStatusVisual {
  indicator: "spinner" | "badge";
  /** Tailwind fill for the badge dot. */
  dot: string;
  /** Tailwind accent for the board-card count pill. */
  pill: string;
  needsAttention: boolean;
  /** Short human label for tooltips / a11y. */
  label: string;
}

const NEUTRAL_PILL = "bg-panel text-muted";

/**
 * Plain process statuses — the classic colored dots. A bare `running` session
 * (no hook signal) is *unknown*: we can't tell working from idle, so it keeps
 * the original green dot rather than a misleading spinner.
 */
export const SESSION_STATUS_VISUAL: Record<SessionStatus, SessionStatusVisual> = {
  running: {
    indicator: "badge",
    dot: "bg-ok motion-safe:animate-pulse",
    pill: NEUTRAL_PILL,
    needsAttention: false,
    label: "Running",
  },
  finished: {
    indicator: "badge",
    dot: "bg-idle",
    pill: NEUTRAL_PILL,
    needsAttention: false,
    label: "Finished",
  },
  error: {
    indicator: "badge",
    dot: "bg-danger",
    pill: NEUTRAL_PILL,
    needsAttention: false,
    label: "Error",
  },
  killed: {
    indicator: "badge",
    dot: "bg-warn",
    pill: NEUTRAL_PILL,
    needsAttention: false,
    label: "Stopped",
  },
};

/**
 * Hook-reported overlays on a `running` session (selected by `sessionVisual`):
 * `busy` = agent working (spinner), `awaiting` = agent paused for the user
 * (the prominent "your turn" badge). Without a configured hook neither applies
 * and the plain green running dot shows instead.
 */
export const RUNNING_BUSY_VISUAL: SessionStatusVisual = {
  // `dot` is unused (the spinner renders instead, with a fixed accent in
  // Spinner.tsx) — kept so the shape matches the other visuals.
  indicator: "spinner",
  dot: "bg-accent",
  pill: NEUTRAL_PILL,
  needsAttention: false,
  label: "Working",
};

export const AWAITING_INPUT_VISUAL: SessionStatusVisual = {
  indicator: "badge",
  dot: "bg-warn",
  pill: "bg-warn/15 text-warn",
  needsAttention: true,
  label: "Awaiting input",
};

const ACTIVITY_VISUAL: Record<SessionActivity, SessionStatusVisual> = {
  busy: RUNNING_BUSY_VISUAL,
  awaiting: AWAITING_INPUT_VISUAL,
};

/** The effective visual for a session: a running session reads by its
 *  hook-reported `activity` (busy/awaiting), falling back to its plain status
 *  visual (green running, or the ended-state dot) when no hook has reported. */
export function sessionVisual(
  status: SessionStatus,
  activity: SessionActivity | null = null,
): SessionStatusVisual {
  if (status === "running" && activity) return ACTIVITY_VISUAL[activity];
  return SESSION_STATUS_VISUAL[status];
}

export interface SessionBadge {
  /** Stable React key — a status name, or "busy"/"awaiting" for the overlays. */
  key: string;
  status: SessionStatus;
  activity: SessionActivity | null;
  count: number;
  visual: SessionStatusVisual;
}

/** Ended statuses shown after the live ones: history last. */
const ENDED_ORDER: SessionStatus[] = ["finished", "error", "killed"];

/** Non-empty session buckets in display order, paired with their visual
 *  treatment — pure, so the server-built tally renders the same on the card.
 *  Running splits into busy (spinner), awaiting (your turn), and unknown (the
 *  classic green dot, when no hook has reported). */
export function sessionBadges(counts: SessionStatusCounts): SessionBadge[] {
  const busy = Math.min(counts.running, counts.busy);
  const awaiting = Math.min(counts.running - busy, counts.awaiting);
  const unknown = Math.max(0, counts.running - busy - awaiting);
  const badges: SessionBadge[] = [];

  if (busy > 0) {
    badges.push({
      key: "busy",
      status: "running",
      activity: "busy",
      count: busy,
      visual: RUNNING_BUSY_VISUAL,
    });
  }
  if (awaiting > 0) {
    badges.push({
      key: "awaiting",
      status: "running",
      activity: "awaiting",
      count: awaiting,
      visual: AWAITING_INPUT_VISUAL,
    });
  }
  if (unknown > 0) {
    badges.push({
      key: "running",
      status: "running",
      activity: null,
      count: unknown,
      visual: SESSION_STATUS_VISUAL.running,
    });
  }
  for (const status of ENDED_ORDER) {
    const count = counts[status];
    if (count > 0) {
      badges.push({
        key: status,
        status,
        activity: null,
        count,
        visual: SESSION_STATUS_VISUAL[status],
      });
    }
  }
  return badges;
}
