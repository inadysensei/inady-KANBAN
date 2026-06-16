import type { SessionEvent } from "./board-events";
import { AGENT_LABELS } from "./agent-display";

/**
 * Pure notification logic shared by NotificationCenter — no React, no DOM, so
 * it's unit-testable. The component owns the side effects (desktop
 * notifications, the favicon canvas, the title prefix, the bell badge).
 */

/** Status changes and "agent needs you" pauses both warrant a notification.
 *  A "busy" activity event only refreshes the board — no toast/badge. */
export function shouldNotify(event: SessionEvent): boolean {
  return (
    event.activity === "awaiting" ||
    event.status === "finished" ||
    event.status === "error"
  );
}

export function notificationBody(event: SessionEvent): string {
  const label = AGENT_LABELS[event.agent];
  if (event.activity === "awaiting") return `${label} needs your input`;
  if (event.status === "finished") return `${label} agent finished`;
  const exit = event.exitCode !== null ? ` (exit ${event.exitCode})` : "";
  return `${label} agent failed${exit}`;
}

/**
 * Next unread-badge count after an event. We only accumulate while the tab is
 * hidden (a focused user is already watching, and the count resets on focus) —
 * the same "only flag when away" rule the title prefix uses. Non-notify events
 * (board refreshes, "busy") leave the count untouched.
 */
export function nextUnreadCount(
  current: number,
  event: SessionEvent,
  hidden: boolean,
): number {
  if (!hidden || !shouldNotify(event)) return current;
  return current + 1;
}

/** Cap the displayed badge count so the favicon/bell stay legible. */
export function formatBadgeCount(count: number): string {
  return count > 9 ? "9+" : String(count);
}
