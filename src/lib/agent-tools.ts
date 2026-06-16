import { AGENT_KINDS, type AgentKind } from "../db/schema";

/**
 * Which AI tools (Cursor / Claude) the launch form offers, and in what order.
 * Managed from Settings, persisted as a JSON array on `app_settings.agent_tools`
 * (same JSON-in-text precedent as agent team members).
 *
 * The stored list is always the FULL ordered set of agent kinds, each with an
 * `enabled` flag — keeping disabled tools (rather than only the enabled ones)
 * preserves display order across toggles and stops `parseAgentTools` from
 * silently re-enabling a deliberately-off tool.
 *
 * Pure data + normalization/validation logic: no React, no node, no drizzle
 * (the schema import is `type`-only at runtime apart from the AGENT_KINDS const,
 * which is plain data), so it loads in the node test env.
 */
export interface AgentToolSetting {
  agent: AgentKind;
  enabled: boolean;
}

const AGENT_KIND_SET = new Set<string>(AGENT_KINDS);

/** Default config: every agent kind enabled, in canonical AGENT_KINDS order. */
export const DEFAULT_AGENT_TOOLS: AgentToolSetting[] = AGENT_KINDS.map(
  (agent) => ({ agent, enabled: true }),
);

/**
 * Parse the stored JSON into a normalized full ordered list:
 * - keeps the stored order and `enabled` flag (incl. disabled tools),
 * - drops unknown agents and de-duplicates (first occurrence wins),
 * - coerces a missing/non-boolean `enabled` to `true`,
 * - appends any AGENT_KINDS missing from the stored list (enabled), so a newly
 *   introduced agent kind shows up by default.
 * Malformed / empty input falls back to every kind enabled.
 */
export function parseAgentTools(
  raw: string | null | undefined,
): AgentToolSetting[] {
  return normalizeAgentTools(decode(raw));
}

/**
 * Canonicalize a raw array of stored/submitted entries into the full ordered
 * list (the rules in `parseAgentTools`'s doc apply). Exposed separately so the
 * server action can re-normalize the untrusted client array directly, without
 * a JSON round-trip.
 */
export function normalizeAgentTools(stored: unknown[]): AgentToolSetting[] {
  const result: AgentToolSetting[] = [];
  const seen = new Set<AgentKind>();

  for (const entry of stored) {
    if (!entry || typeof entry !== "object") continue;
    const agent = (entry as { agent?: unknown }).agent;
    if (typeof agent !== "string" || !AGENT_KIND_SET.has(agent)) continue;
    const kind = agent as AgentKind;
    if (seen.has(kind)) continue;
    seen.add(kind);
    result.push({
      agent: kind,
      enabled: (entry as { enabled?: unknown }).enabled !== false,
    });
  }

  for (const agent of AGENT_KINDS) {
    if (!seen.has(agent)) result.push({ agent, enabled: true });
  }
  return result;
}

function decode(raw: string | null | undefined): unknown[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function serializeAgentTools(tools: AgentToolSetting[]): string {
  return JSON.stringify(
    tools.map(({ agent, enabled }) => ({ agent, enabled })),
  );
}

/** Enabled agents, in display order — what the launch form should offer. */
export function enabledAgents(tools: AgentToolSetting[]): AgentKind[] {
  return tools.filter((t) => t.enabled).map((t) => t.agent);
}

/** At least one tool must stay enabled, else there is nothing to launch. */
export function validateAgentTools(tools: AgentToolSetting[]): void {
  if (!tools.some((t) => t.enabled)) {
    throw new Error("Select at least one AI tool.");
  }
}

/** Toggle the `enabled` flag at an index, returning a new array. */
export function setAgentToolEnabled(
  tools: AgentToolSetting[],
  index: number,
  enabled: boolean,
): AgentToolSetting[] {
  return tools.map((tool, i) => (i === index ? { ...tool, enabled } : tool));
}

/**
 * Move the tool at `index` one slot in `direction` (-1 up, +1 down), returning
 * a new array. A move past either end is a no-op (the original array).
 */
export function moveAgentTool(
  tools: AgentToolSetting[],
  index: number,
  direction: -1 | 1,
): AgentToolSetting[] {
  const target = index + direction;
  if (target < 0 || target >= tools.length) return tools;
  const next = [...tools];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
