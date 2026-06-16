import { afterEach, expect, test, vi } from "vitest";

// CURSOR_AGENT_BIN is resolved once at module load, so each case re-imports the
// module under a different env. Kept separate from cursor-agent.test.ts (which
// mocks child_process) so these stay a plain module-init check.
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

test("CURSOR_AGENT_BIN honors the env override when set", async () => {
  vi.stubEnv("CURSOR_AGENT_BIN", "/custom/path/to/cursor");
  vi.resetModules();
  const { CURSOR_AGENT_BIN } = await import("./cursor-agent");
  expect(CURSOR_AGENT_BIN).toBe("/custom/path/to/cursor");
});

test("CURSOR_AGENT_BIN falls back to 'cursor-agent' when unset/empty", async () => {
  vi.stubEnv("CURSOR_AGENT_BIN", "");
  vi.resetModules();
  const { CURSOR_AGENT_BIN } = await import("./cursor-agent");
  expect(CURSOR_AGENT_BIN).toBe("cursor-agent");
});
