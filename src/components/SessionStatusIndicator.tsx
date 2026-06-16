import type { SessionActivity, SessionStatus } from "@/db/schema";
import { sessionVisual } from "@/lib/agent-display";
import Spinner from "@/components/Spinner";

/**
 * One session's status at a glance: a spinner while a hook confirms the agent is
 * working, the amber "your turn" dot when it has paused for the user, otherwise
 * the classic process-status dot (green running / red error / …). Shared by the
 * session list and board-card badges so it reads the same everywhere.
 *
 * `activity` is the hook-reported overlay on a running session (null = no hook).
 *
 * Pass `decorative` when the surrounding element already carries the accessible
 * name (e.g. the board-card count pill labels itself with count + status); the
 * glyph then renders purely visually to avoid announcing the status twice.
 */
export default function SessionStatusIndicator({
  status,
  activity = null,
  decorative = false,
}: {
  status: SessionStatus;
  activity?: SessionActivity | null;
  decorative?: boolean;
}) {
  const visual = sessionVisual(status, activity);

  const glyph =
    visual.indicator === "spinner" ? (
      <Spinner />
    ) : (
      <span
        aria-hidden
        className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${visual.dot}`}
      />
    );

  if (decorative) return glyph;

  return (
    <span title={visual.label} className="inline-flex items-center">
      {glyph}
      <span className="sr-only">{visual.label}</span>
    </span>
  );
}
