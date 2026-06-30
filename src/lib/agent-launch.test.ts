import { describe, expect, test } from "vitest";
import {
  CLAUDE_EFFORTS,
  CLAUDE_MODELS,
  CLINE_EFFORTS,
  DEFAULT_CLAUDE_EFFORT,
  DEFAULT_CLAUDE_MODEL,
  DEFAULT_CLINE_EFFORT,
  buildAgentTeamPrompt,
  parseAgentTeamMembers,
  parseClaudeEffort,
  parseClaudeModel,
  parseClineEffort,
  resolveClaudeLaunchOptions,
  resolveMainPrompt,
} from "./agent-launch";

describe("buildAgentTeamPrompt", () => {
  test("claude prefix lists trimmed non-empty members", () => {
    expect(
      buildAgentTeamPrompt("claude", [" explore ", "implement", ""], "fix bug"),
    ).toBe(
      "Create an agent team to implement this issue: explore, implement\n\nfix bug",
    );
  });

  test("cursor prefix lists subagents", () => {
    expect(
      buildAgentTeamPrompt("cursor", ["a", "b"], "do work"),
    ).toBe("Implement this issue with these subagents: a, b\n\ndo work");
  });

  test("cline uses the same subagents phrasing as cursor", () => {
    expect(
      buildAgentTeamPrompt("cline", ["a", "b"], "do work"),
    ).toBe("Implement this issue with these subagents: a, b\n\ndo work");
  });

  test("returns base prompt unchanged when no members", () => {
    expect(buildAgentTeamPrompt("claude", ["", "  "], "solo")).toBe("solo");
  });
});

describe("resolveMainPrompt", () => {
  test("wraps with agent team when members provided", () => {
    expect(
      resolveMainPrompt({
        agent: "claude",
        basePrompt: "weekly review",
        agentTeamMembers: ["reviewer", "fixer"],
      }),
    ).toBe(
      "Create an agent team to implement this issue: reviewer, fixer\n\nweekly review",
    );
  });

  test("passes through when agent team disabled", () => {
    expect(
      resolveMainPrompt({
        agent: "cursor",
        basePrompt: "  ship it  ",
        agentTeamMembers: [],
      }),
    ).toBe("ship it");
  });
});

describe("parseAgentTeamMembers", () => {
  test("parses JSON array of strings", () => {
    expect(parseAgentTeamMembers('["a","b"]')).toEqual(["a", "b"]);
  });

  test("returns empty array for invalid input", () => {
    expect(parseAgentTeamMembers(null)).toEqual([]);
    expect(parseAgentTeamMembers("not json")).toEqual([]);
  });
});

describe("claude option parsing", () => {
  test("defaults", () => {
    expect(DEFAULT_CLAUDE_MODEL).toBe("opus");
    expect(DEFAULT_CLAUDE_EFFORT).toBe("xhigh");
    expect(CLAUDE_MODELS).toEqual(["opus", "sonnet"]);
    expect(CLAUDE_EFFORTS).toEqual([
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
      "ultracode",
    ]);
  });

  test("parseClaudeModel falls back to default", () => {
    expect(parseClaudeModel("sonnet")).toBe("sonnet");
    expect(parseClaudeModel("gpt")).toBe(DEFAULT_CLAUDE_MODEL);
  });

  test("parseClaudeEffort falls back to default", () => {
    expect(parseClaudeEffort("high")).toBe("high");
    expect(parseClaudeEffort("turbo")).toBe(DEFAULT_CLAUDE_EFFORT);
  });
});

describe("cline effort parsing", () => {
  test("defaults", () => {
    expect(DEFAULT_CLINE_EFFORT).toBe("xhigh");
    expect(CLINE_EFFORTS).toEqual(["none", "low", "medium", "high", "xhigh"]);
  });

  test("parseClineEffort keeps a known level and falls back otherwise", () => {
    expect(parseClineEffort("none")).toBe("none");
    expect(parseClineEffort("high")).toBe("high");
    expect(parseClineEffort("ultracode")).toBe(DEFAULT_CLINE_EFFORT);
    expect(parseClineEffort(null)).toBe(DEFAULT_CLINE_EFFORT);
  });

  test("resolveClaudeLaunchOptions prefers explicit values", () => {
    expect(
      resolveClaudeLaunchOptions({
        model: "sonnet",
        effort: "low",
        defaultModel: "opus",
        defaultEffort: "xhigh",
      }),
    ).toEqual({ model: "sonnet", effort: "low" });
  });

  test("resolveClaudeLaunchOptions uses defaults when omitted", () => {
    expect(
      resolveClaudeLaunchOptions({
        defaultModel: "sonnet",
        defaultEffort: "max",
      }),
    ).toEqual({ model: "sonnet", effort: "max" });
  });
});
