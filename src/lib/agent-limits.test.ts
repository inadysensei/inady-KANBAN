import { afterEach, describe, expect, test, vi } from "vitest";

describe("agent-limits", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  test("defaults to 20 when env is unset", async () => {
    vi.stubEnv("INADY_KANBAN_MAX_CONCURRENT_AGENTS", undefined);
    const { MAX_CONCURRENT_AGENTS, concurrentLimitMessage } = await import(
      "./agent-limits"
    );
    expect(MAX_CONCURRENT_AGENTS).toBe(20);
    expect(concurrentLimitMessage()).toBe(
      "At most 20 agents can run at once. Stop one first.",
    );
  });

  test("falls back to 20 for invalid env", async () => {
    vi.stubEnv("INADY_KANBAN_MAX_CONCURRENT_AGENTS", "not-a-number");
    const { MAX_CONCURRENT_AGENTS } = await import("./agent-limits");
    expect(MAX_CONCURRENT_AGENTS).toBe(20);
  });
});
