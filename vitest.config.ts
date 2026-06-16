import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      // t-wada principle: coverage is a tool to find untested *meaningful* logic,
      // not a number to chase. Scope it to the pure, deterministic units where a
      // unit test gives real signal at low cost. PTY/WebSocket/DB/React code is
      // integration/UI — it's verified by running the app (see CLAUDE.md), not by
      // mocking node-pty just to inflate a percentage.
      include: [
        "src/lib/prompt.ts",
        "src/lib/cursor-agent.ts",
        "src/lib/agent-cli.ts",
      ],
      reporter: ["text", "text-summary"],
      thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 },
    },
  },
});
