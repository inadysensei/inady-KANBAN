import type { AgentKind } from "../db/schema";

export const CLAUDE_MODELS = ["opus", "sonnet"] as const;
export const CLAUDE_EFFORTS = [
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
  "ultracode",
] as const;

export type ClaudeModel = (typeof CLAUDE_MODELS)[number];
export type ClaudeEffort = (typeof CLAUDE_EFFORTS)[number];

export const DEFAULT_CLAUDE_MODEL: ClaudeModel = "opus";
export const DEFAULT_CLAUDE_EFFORT: ClaudeEffort = "xhigh";

const CLAUDE_MODEL_SET = new Set<string>(CLAUDE_MODELS);
const CLAUDE_EFFORT_SET = new Set<string>(CLAUDE_EFFORTS);

export function parseClaudeModel(value: string | null | undefined): ClaudeModel {
  if (value && CLAUDE_MODEL_SET.has(value)) return value as ClaudeModel;
  return DEFAULT_CLAUDE_MODEL;
}

export function parseClaudeEffort(value: string | null | undefined): ClaudeEffort {
  if (value && CLAUDE_EFFORT_SET.has(value)) return value as ClaudeEffort;
  return DEFAULT_CLAUDE_EFFORT;
}

export function resolveClaudeLaunchOptions(opts: {
  model?: string | null;
  effort?: string | null;
  defaultModel?: ClaudeModel;
  defaultEffort?: ClaudeEffort;
}): { model: ClaudeModel; effort: ClaudeEffort } {
  const fallbackModel = opts.defaultModel ?? DEFAULT_CLAUDE_MODEL;
  const fallbackEffort = opts.defaultEffort ?? DEFAULT_CLAUDE_EFFORT;
  return {
    model: opts.model ? parseClaudeModel(opts.model) : fallbackModel,
    effort: opts.effort ? parseClaudeEffort(opts.effort) : fallbackEffort,
  };
}

export function serializeAgentTeamMembers(members: string[]): string {
  return JSON.stringify(members.map((m) => m.trim()).filter(Boolean));
}

export function padAgentTeamMembers(
  members: string[],
  minSlots = 3,
): string[] {
  if (members.length >= minSlots) return members;
  return [...members, ...Array.from({ length: minSlots - members.length }, () => "")];
}

/** Normalize a JSON-encoded member list from the DB. */
export function parseAgentTeamMembers(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}

export function buildAgentTeamPrompt(
  agent: AgentKind,
  members: string[],
  basePrompt: string,
): string {
  const names = members.map((m) => m.trim()).filter(Boolean);
  const prompt = basePrompt.trim();
  if (names.length === 0) return prompt;

  const list = names.join(", ");
  const prefix =
    agent === "claude"
      ? `Create an agent team to implement this issue: ${list}`
      : `Implement this issue with these subagents: ${list}`;
  return prompt ? `${prefix}\n\n${prompt}` : prefix;
}

export function resolveMainPrompt(opts: {
  agent: AgentKind;
  basePrompt: string;
  agentTeamMembers: string[];
}): string {
  return buildAgentTeamPrompt(opts.agent, opts.agentTeamMembers, opts.basePrompt);
}
