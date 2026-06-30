/**
 * Pure tag logic: color/name normalization + tag-id resolution. No React, node,
 * or drizzle at runtime (mirrors agent-tools.ts / working-dirs.ts), so it loads
 * in the node test env and on both module graphs.
 */

export interface DefaultTag {
  name: string;
  color: string;
}

/**
 * Seeded once on first boot (bootstrap.ts): the priority tags every board starts
 * with. High = red, Mid = amber, Low = green — already normalized 6-digit hex.
 */
export const DEFAULT_TAGS: DefaultTag[] = [
  { name: "High", color: "#ef4444" },
  { name: "Mid", color: "#f59e0b" },
  { name: "Low", color: "#22c55e" },
];

const HEX_COLOR_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * Normalize a user-entered color code to a lowercase 6-digit `#rrggbb`. Accepts
 * `#rgb` shorthand (expanded) or `#rrggbb`; throws on anything else. Storing a
 * predictable 6-digit hex lets the UI append a 2-hex alpha suffix (e.g.
 * `${color}24` for the pill fill, `${color}55` for its border) and still get a
 * valid 8-digit `#rrggbbaa`.
 */
export function normalizeTagColor(input: string): string {
  const trimmed = input.trim().toLowerCase();
  if (!HEX_COLOR_RE.test(trimmed)) {
    throw new Error("color must be a hex code like #rrggbb");
  }
  if (trimmed.length === 4) {
    const [, r, g, b] = trimmed;
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return trimmed;
}

/** Validate a color without throwing — for live UI feedback. */
export function isValidTagColor(input: string): boolean {
  return HEX_COLOR_RE.test(input.trim());
}

/** Trim a tag name and reject empty / whitespace-only. */
export function normalizeTagName(input: string): string {
  const name = input.trim();
  if (!name) throw new Error("tag name is required");
  return name;
}

/**
 * The subset of `requestedIds` that exist in `existingIds`, de-duplicated and in
 * requested order. Unknown ids are dropped silently — per the ticket, a tag id
 * that no longer matches a tag is skipped while ticket creation still succeeds.
 */
export function resolveTagIds(
  requestedIds: readonly string[],
  existingIds: Iterable<string>,
): string[] {
  const exists = new Set(existingIds);
  const seen = new Set<string>();
  const result: string[] = [];
  for (const id of requestedIds) {
    if (!exists.has(id) || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  return result;
}

/** The minimal tag shape the board card renders — no timestamps/position. */
export interface TagChip {
  id: string;
  name: string;
  color: string;
}

/**
 * Fold `(ticketId + tag fields)` join rows into a per-ticket ordered list of
 * chips — pure, so the server page builds it and client cards read it (same
 * shape pattern as `tallySessionCounts`). Rows are expected pre-ordered (by
 * `tags.position`); first-seen order is preserved per ticket.
 */
export function groupTagsByTicket(
  rows: readonly {
    ticketId: string;
    id: string;
    name: string;
    color: string;
  }[],
): Record<string, TagChip[]> {
  const grouped: Record<string, TagChip[]> = {};
  for (const { ticketId, id, name, color } of rows) {
    (grouped[ticketId] ??= []).push({ id, name, color });
  }
  return grouped;
}

/**
 * Board tag-filter predicate: does a ticket (by its tag ids) pass the active
 * tag selection? No active tags ⇒ the filter is off ⇒ everything matches.
 *
 * Semantics are **OR** (a ticket matches if it carries *any* active tag), not
 * AND: the seeded tags are mutually exclusive priorities (High/Mid/Low), so AND
 * would turn multi-select into a dead end — no ticket is ever both High and Mid.
 * OR makes adding a tag broaden the view ("show me High *or* Mid"), which is the
 * useful behavior for narrowing a backlog by clicking chips.
 */
export function ticketMatchesTags(
  ticketTagIds: readonly string[],
  activeTagIds: readonly string[],
): boolean {
  if (activeTagIds.length === 0) return true;
  const active = new Set(activeTagIds);
  return ticketTagIds.some((id) => active.has(id));
}
