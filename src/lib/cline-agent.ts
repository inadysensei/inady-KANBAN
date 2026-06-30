import { spawn } from "node:child_process";

/** Allow overriding the cline binary path; defaults to whatever is on PATH. */
export const CLINE_BIN = process.env.CLINE_BIN || "cline";

/**
 * cline assigns its OWN conversation id and exposes it only after the session
 * has started — there is no `create-chat` (cursor) or pinnable `--session-id`
 * (claude). Its `--id` flag is RESUME-ONLY: passing a fresh id on the initial
 * launch makes cline try to resume a non-existent session and silently skips
 * the positional prompt. So cline launches WITHOUT `--id` (a new session), and
 * we recover the id afterwards from `cline history --json` to enable resume.
 *
 * The pure helpers below (parse + pick) are unit-tested; the spawn/poll runner
 * is integration (verified by running, like cursor-agent's createChat).
 */

/** One entry from `cline history --json` (camelCase; see @cline SessionRuntimeRecordShape).
 *  Only the fields we match on are typed; everything else is ignored. */
export interface ClineHistoryEntry {
  sessionId: string;
  cwd?: string;
  workspaceRoot?: string;
  interactive?: boolean;
  startedAt?: string;
  prompt?: string;
}

/** Parse `cline history --json` stdout into entries. Defensive: non-array /
 *  malformed JSON → [], and entries without a string `sessionId` are dropped. */
export function parseClineHistory(stdout: string): ClineHistoryEntry[] {
  try {
    const parsed: unknown = JSON.parse(stdout);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is ClineHistoryEntry =>
        !!e &&
        typeof e === "object" &&
        typeof (e as { sessionId?: unknown }).sessionId === "string",
    );
  } catch {
    return [];
  }
}

/**
 * Identify the session we just launched: an interactive session whose stored
 * prompt exactly matches the one we passed (the wrapped prompt is unique per
 * ticket, so this disambiguates from every prior session — and works even with
 * `--worktree`, where cline's cwd is a detached worktree path). Ties (e.g. a
 * re-run of the same ticket) break toward the same cwd, then the newest start.
 * Returns null when nothing matches (caller keeps its placeholder id).
 */
export function pickClineSession(
  entries: ClineHistoryEntry[],
  opts: { cwd: string; prompt: string },
): string | null {
  const matches = entries
    .filter((e) => e.interactive !== false && e.prompt === opts.prompt)
    .sort((a, b) => {
      const aCwd = a.cwd === opts.cwd || a.workspaceRoot === opts.cwd ? 1 : 0;
      const bCwd = b.cwd === opts.cwd || b.workspaceRoot === opts.cwd ? 1 : 0;
      if (aCwd !== bCwd) return bCwd - aCwd;
      return (b.startedAt ?? "").localeCompare(a.startedAt ?? "");
    });
  return matches[0]?.sessionId ?? null;
}

function runClineHistory(): Promise<ClineHistoryEntry[]> {
  return new Promise((resolve) => {
    let stdout = "";
    const child = spawn(CLINE_BIN, ["history", "--json", "--limit", "100"], {
      env: process.env,
    });
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.on("error", () => resolve([]));
    child.on("close", () => resolve(parseClineHistory(stdout)));
  });
}

/**
 * Poll cline's session history until the session we just launched shows up,
 * returning its id (for resume) or null on timeout. Cheap-ish and best-effort:
 * on timeout the caller keeps the placeholder id, so a later resume just starts
 * a fresh conversation instead of restoring the old one.
 */
export async function captureClineSessionId(opts: {
  cwd: string;
  prompt: string;
  attempts?: number;
  delayMs?: number;
}): Promise<string | null> {
  const attempts = opts.attempts ?? 8;
  const delayMs = opts.delayMs ?? 750;
  for (let i = 0; i < attempts; i++) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    const id = pickClineSession(await runClineHistory(), {
      cwd: opts.cwd,
      prompt: opts.prompt,
    });
    if (id) return id;
  }
  return null;
}
