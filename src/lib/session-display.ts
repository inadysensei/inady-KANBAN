/**
 * Pure display helpers for agent session rows. No React, no node APIs —
 * loadable in both the node test env and the client bundle.
 */

/** First non-empty line of a prompt, trimmed. Empty string if none. */
export function promptFirstLine(prompt: string): string {
  for (const line of prompt.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed) return trimmed;
  }
  return "";
}

/**
 * Humanize an elapsed span between two epoch-ms timestamps:
 * "42s", "3m 12s", "1h 05m" (seconds dropped at hour scale).
 * Negative spans clamp to "0s".
 */
export function formatDuration(startedAt: number, endedAt: number): string {
  const totalSeconds = Math.max(0, Math.floor((endedAt - startedAt) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}
