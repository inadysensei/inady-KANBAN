import type { AgentKind } from "../db/schema";
import type { ClaudeEffort, ClaudeModel } from "./agent-launch";
import { CURSOR_AGENT_BIN, filterStderr } from "./cursor-agent";

/** Allow overriding the claude binary path; defaults to whatever is on PATH. */
export const CLAUDE_BIN = process.env.CLAUDE_BIN || "claude";

/**
 * Everything the PTY layer needs to drive one agent CLI. All sessions are
 * interactive TUIs: the initial launch auto-submits the prompt as a positional
 * arg, and per-command approval stays on (no --force / bypass flags).
 */
export interface AgentCli {
  /** Binary to spawn (overridable via env). */
  bin: string;
  /** argv for launching the session in a PTY. */
  buildArgs(opts: {
    sessionId: string;
    wrappedPrompt: string;
    resume: boolean;
    claudeModel?: ClaudeModel;
    claudeEffort?: ClaudeEffort;
  }): string[];
  /**
   * Line the TUI prints when the workspace/folder isn't trusted yet. The PTY
   * layer auto-answers once with `trustAnswer` — tickets point at the user's
   * own repos, and trust persists per-workspace after that.
   */
  trustPromptRe: RegExp;
  trustAnswer: string;
  /** Drop known-harmless noise from the PTY stream (identity if none known). */
  filterOutput(chunk: string): string;
}

export const AGENT_CLIS: Record<AgentKind, AgentCli> = {
  cursor: {
    bin: CURSOR_AGENT_BIN,
    // The chat UUID is pre-issued via `cursor-agent create-chat`, so both the
    // initial launch and a re-open go through --resume.
    buildArgs: ({ sessionId, wrappedPrompt, resume }) =>
      resume ? ["--resume", sessionId] : ["--resume", sessionId, wrappedPrompt],
    // "▶ [a] Trust this workspace"
    trustPromptRe: /Trust this workspace/,
    trustAnswer: "a",
    filterOutput: filterStderr,
  },
  claude: {
    bin: CLAUDE_BIN,
    // claude has no create-chat equivalent; we generate the UUID locally and
    // pin it with --session-id on first launch, then --resume it later.
    buildArgs: ({ sessionId, wrappedPrompt, resume, claudeModel, claudeEffort }) => {
      if (resume) return ["--resume", sessionId];
      const args = ["--session-id", sessionId];
      if (claudeModel) args.push("--model", claudeModel);
      if (claudeEffort) args.push("--effort", claudeEffort);
      args.push(wrappedPrompt);
      return args;
    },
    // "Do you trust the files in this folder?" — Enter accepts the default
    // "Yes, proceed".
    trustPromptRe: /Do you trust the files in this folder\?/,
    trustAnswer: "\r",
    filterOutput: (chunk) => chunk,
  },
};
