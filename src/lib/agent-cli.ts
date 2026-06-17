import type { AgentKind } from "../db/schema";
import type { ClaudeEffort, ClaudeModel } from "./agent-launch";
import { CURSOR_AGENT_BIN, filterStderr } from "./cursor-agent";

/** Allow overriding the claude binary path; defaults to whatever is on PATH. */
export const CLAUDE_BIN = process.env.CLAUDE_BIN || "claude";

/**
 * Everything the PTY layer needs to drive one agent CLI. All sessions are
 * interactive TUIs: the initial launch auto-submits the prompt as a positional
 * arg. Per-CLI approval posture lives in each entry below (cursor keeps
 * per-command approval; claude launches in --permission-mode auto).
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
    /** Combined cursor model id (effort baked in). Passed via --model on every
     *  cursor launch — it's per-invocation, not pinned to the chat. */
    cursorModel?: string;
    /** Launch in an isolated git worktree (`--worktree`). Initial launch only. */
    worktree?: boolean;
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
    // initial launch and a re-open go through --resume. `--worktree` only makes
    // sense on the initial launch (it creates a *new* worktree); it goes first
    // so the next token is another flag — its optional `[name]` would otherwise
    // swallow the positional prompt. `--model` is re-passed on EVERY launch
    // (incl. resume): cursor's --model is per-invocation, not pinned to the chat
    // (`create-chat` takes no model), so omitting it on resume would silently
    // revert to cursor's default. It takes a value, so it never swallows the
    // positional prompt.
    buildArgs: ({ sessionId, wrappedPrompt, resume, worktree, cursorModel }) => {
      const model = cursorModel ? ["--model", cursorModel] : [];
      if (resume) return ["--resume", sessionId, ...model];
      const lead = worktree ? ["--worktree"] : [];
      return [...lead, "--resume", sessionId, ...model, wrappedPrompt];
    },
    // "▶ [a] Trust this workspace"
    trustPromptRe: /Trust this workspace/,
    trustAnswer: "a",
    filterOutput: filterStderr,
  },
  claude: {
    bin: CLAUDE_BIN,
    // claude has no create-chat equivalent; we generate the UUID locally and
    // pin it with --session-id on first launch, then --resume it later.
    // --permission-mode auto on both: it's a per-run setting (not pinned to the
    // conversation like model/effort), so a resumed session launches the same way.
    buildArgs: ({
      sessionId,
      wrappedPrompt,
      resume,
      claudeModel,
      claudeEffort,
      worktree,
    }) => {
      if (resume) return ["--resume", sessionId, "--permission-mode", "auto"];
      // `--worktree` first (initial launch only): leading so the token after it
      // is another flag — its optional `[name]` would otherwise swallow the
      // positional prompt.
      const args = worktree ? ["--worktree"] : [];
      args.push("--session-id", sessionId, "--permission-mode", "auto");
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
