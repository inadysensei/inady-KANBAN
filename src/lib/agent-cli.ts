import type { AgentKind } from "../db/schema";
import type { ClaudeEffort, ClaudeModel, ClineEffort } from "./agent-launch";
import { CURSOR_AGENT_BIN, filterStderr } from "./cursor-agent";
import { CLINE_BIN } from "./cline-agent";

/** Allow overriding the claude binary path; defaults to whatever is on PATH. */
export const CLAUDE_BIN = process.env.CLAUDE_BIN || "claude";

/** Provider id clinepass models are served under (cline's `-P` flag). */
export const CLINE_PROVIDER = "cline-pass";

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
    /** Combined clinepass model id (e.g. "cline-pass/glm-5.2"). Re-passed on
     *  every cline launch via -m (per-invocation). */
    clineModel?: string;
    /** cline reasoning level (`--thinking <level>`). Re-passed on every launch. */
    clineEffort?: ClineEffort;
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
  cline: {
    bin: CLINE_BIN,
    // `-i` opens the interactive TUI (bare `cline "prompt"` is headless — we
    // need the TUI to stream a PTY to xterm.js). `--auto-approve true` matches
    // claude's autonomous posture. Model/provider/effort are per-invocation
    // (cline takes them via -m/-P/--thinking, not pinned to the session), so —
    // like cursor's --model — they're re-passed on EVERY launch incl. resume;
    // omitting them on resume would revert to cline's defaults.
    //
    // SESSION ID: cline's `--id` is RESUME-ONLY — passing a fresh id on the
    // initial launch makes cline try to resume a non-existent session and skips
    // the positional prompt (so the agent never starts the task). So the
    // initial launch carries NO `--id` (cline mints its own id); pty-registry
    // recovers that id from `cline history --json` (see cline-agent.ts) and
    // stores it as the session's agentSessionId, which resume then passes back
    // via `--id`. The prompt is the last positional (no flag can swallow it).
    // `--worktree` (no arg, initial launch only) auto-creates a detached
    // worktree under ~/.cline/worktrees/.
    buildArgs: ({
      sessionId,
      wrappedPrompt,
      resume,
      clineModel,
      clineEffort,
      worktree,
    }) => {
      const model = clineModel ? ["-m", clineModel] : [];
      const thinking = clineEffort ? ["--thinking", clineEffort] : [];
      const common = [
        "-i",
        "--auto-approve",
        "true",
        "-P",
        CLINE_PROVIDER,
        ...model,
        ...thinking,
      ];
      // Resume re-opens the captured conversation by id (no prompt).
      if (resume) return [...common, "--id", sessionId];
      // Initial launch: NO --id (cline creates the session); prompt last.
      const lead = worktree ? ["--worktree"] : [];
      return [...lead, ...common, wrappedPrompt];
    },
    // cline runs with --auto-approve, so there's no workspace-trust prompt to
    // answer — an inert matcher (matches nothing) keeps the AgentCli shape.
    trustPromptRe: /(?!)/,
    trustAnswer: "",
    filterOutput: (chunk) => chunk,
  },
};
