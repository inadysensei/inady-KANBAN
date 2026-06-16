import { afterEach, expect, test, vi } from "vitest";

// CLAUDE_BIN is resolved once at module load, so each case re-imports the
// module under a different env — same pattern as cursor-agent.env.test.ts.
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

test("claude bin honors the CLAUDE_BIN env override when set", async () => {
  vi.stubEnv("CLAUDE_BIN", "/custom/path/to/claude");
  vi.resetModules();
  const { AGENT_CLIS } = await import("./agent-cli");
  expect(AGENT_CLIS.claude.bin).toBe("/custom/path/to/claude");
});

test("claude bin falls back to 'claude' when unset/empty", async () => {
  vi.stubEnv("CLAUDE_BIN", "");
  vi.resetModules();
  const { AGENT_CLIS } = await import("./agent-cli");
  expect(AGENT_CLIS.claude.bin).toBe("claude");
});

test("cursor bin follows CURSOR_AGENT_BIN", async () => {
  vi.stubEnv("CURSOR_AGENT_BIN", "/custom/path/to/cursor-agent");
  vi.resetModules();
  const { AGENT_CLIS } = await import("./agent-cli");
  expect(AGENT_CLIS.cursor.bin).toBe("/custom/path/to/cursor-agent");
});
