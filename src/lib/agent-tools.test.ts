import { describe, expect, test } from "vitest";
import { AGENT_KINDS } from "../db/schema";
import {
  DEFAULT_AGENT_TOOLS,
  enabledAgents,
  moveAgentTool,
  normalizeAgentTools,
  parseAgentTools,
  serializeAgentTools,
  setAgentToolEnabled,
  validateAgentTools,
} from "./agent-tools";

describe("DEFAULT_AGENT_TOOLS", () => {
  test("lists every agent kind, all enabled, in AGENT_KINDS order", () => {
    expect(DEFAULT_AGENT_TOOLS).toEqual(
      AGENT_KINDS.map((agent) => ({ agent, enabled: true })),
    );
  });
});

describe("parseAgentTools", () => {
  test("returns the default (both enabled) for empty / null / blank", () => {
    expect(parseAgentTools("[]")).toEqual(DEFAULT_AGENT_TOOLS);
    expect(parseAgentTools(null)).toEqual(DEFAULT_AGENT_TOOLS);
    expect(parseAgentTools(undefined)).toEqual(DEFAULT_AGENT_TOOLS);
    expect(parseAgentTools("")).toEqual(DEFAULT_AGENT_TOOLS);
  });

  test("falls back to the default for malformed JSON", () => {
    expect(parseAgentTools("not json")).toEqual(DEFAULT_AGENT_TOOLS);
    expect(parseAgentTools("{}")).toEqual(DEFAULT_AGENT_TOOLS);
  });

  test("preserves stored order and the enabled flag, incl. disabled tools", () => {
    const raw = JSON.stringify([
      { agent: "claude", enabled: false },
      { agent: "cursor", enabled: true },
    ]);
    expect(parseAgentTools(raw)).toEqual([
      { agent: "claude", enabled: false },
      { agent: "cursor", enabled: true },
    ]);
  });

  test("drops unknown agents and coerces a missing/invalid enabled to true", () => {
    const raw = JSON.stringify([
      { agent: "bogus", enabled: true },
      { agent: "cursor" },
    ]);
    const parsed = parseAgentTools(raw);
    expect(parsed.find((t) => t.agent === "cursor")).toEqual({
      agent: "cursor",
      enabled: true,
    });
    expect(parsed.some((t) => (t.agent as string) === "bogus")).toBe(false);
  });

  test("appends any agent kind missing from the stored list, enabled", () => {
    const raw = JSON.stringify([{ agent: "claude", enabled: false }]);
    const parsed = parseAgentTools(raw);
    expect(parsed.map((t) => t.agent)).toEqual(["claude", "cursor"]);
    expect(parsed.find((t) => t.agent === "cursor")).toEqual({
      agent: "cursor",
      enabled: true,
    });
  });

  test("de-duplicates repeated agents, keeping the first occurrence", () => {
    const raw = JSON.stringify([
      { agent: "cursor", enabled: false },
      { agent: "cursor", enabled: true },
    ]);
    const cursors = parseAgentTools(raw).filter((t) => t.agent === "cursor");
    expect(cursors).toEqual([{ agent: "cursor", enabled: false }]);
  });
});

describe("normalizeAgentTools", () => {
  test("canonicalizes an in-memory array directly (the server's entry point)", () => {
    const normalized = normalizeAgentTools([
      { agent: "claude", enabled: false },
      { agent: "bogus", enabled: true },
      { agent: "claude", enabled: true },
    ]);
    expect(normalized).toEqual([
      { agent: "claude", enabled: false },
      { agent: "cursor", enabled: true },
    ]);
  });

  test("returns every kind enabled for a non-array / empty input", () => {
    expect(normalizeAgentTools([])).toEqual(DEFAULT_AGENT_TOOLS);
  });
});

describe("serializeAgentTools", () => {
  test("round-trips through parseAgentTools", () => {
    const tools = [
      { agent: "claude" as const, enabled: false },
      { agent: "cursor" as const, enabled: true },
    ];
    expect(parseAgentTools(serializeAgentTools(tools))).toEqual(tools);
  });
});

describe("enabledAgents", () => {
  test("returns only enabled agents, in list order", () => {
    expect(
      enabledAgents([
        { agent: "claude", enabled: false },
        { agent: "cursor", enabled: true },
      ]),
    ).toEqual(["cursor"]);
  });

  test("returns both when both enabled, preserving order", () => {
    expect(
      enabledAgents([
        { agent: "claude", enabled: true },
        { agent: "cursor", enabled: true },
      ]),
    ).toEqual(["claude", "cursor"]);
  });
});

describe("validateAgentTools", () => {
  test("passes when at least one tool is enabled", () => {
    expect(() =>
      validateAgentTools([
        { agent: "cursor", enabled: true },
        { agent: "claude", enabled: false },
      ]),
    ).not.toThrow();
  });

  test("throws when no tool is enabled", () => {
    expect(() =>
      validateAgentTools([
        { agent: "cursor", enabled: false },
        { agent: "claude", enabled: false },
      ]),
    ).toThrow(/at least one/i);
  });
});

describe("setAgentToolEnabled", () => {
  test("toggles the enabled flag at an index without mutating the input", () => {
    const tools = [
      { agent: "cursor" as const, enabled: true },
      { agent: "claude" as const, enabled: true },
    ];
    const next = setAgentToolEnabled(tools, 1, false);
    expect(next).toEqual([
      { agent: "cursor", enabled: true },
      { agent: "claude", enabled: false },
    ]);
    expect(tools[1].enabled).toBe(true);
  });
});

describe("moveAgentTool", () => {
  const tools = [
    { agent: "cursor" as const, enabled: true },
    { agent: "claude" as const, enabled: false },
  ];

  test("moves an item down without mutating the input", () => {
    expect(moveAgentTool(tools, 0, 1)).toEqual([
      { agent: "claude", enabled: false },
      { agent: "cursor", enabled: true },
    ]);
    expect(tools[0].agent).toBe("cursor");
  });

  test("moves an item up", () => {
    expect(moveAgentTool(tools, 1, -1)).toEqual([
      { agent: "claude", enabled: false },
      { agent: "cursor", enabled: true },
    ]);
  });

  test("clamps at the edges (no-op when moving past either end)", () => {
    expect(moveAgentTool(tools, 0, -1)).toEqual(tools);
    expect(moveAgentTool(tools, 1, 1)).toEqual(tools);
  });
});
