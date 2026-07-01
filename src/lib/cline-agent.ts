import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";

/** Allow overriding the cline binary path; defaults to whatever is on PATH. */
export const CLINE_BIN = process.env.CLINE_BIN || "cline";

/**
 * cline assigns its OWN conversation id and exposes it only after the session
 * has started — there is no `create-chat` (cursor) or pinnable `--session-id`
 * (claude). Its `--id` flag is RESUME-ONLY: passing a fresh id on the initial
 * launch makes cline try to resume a non-existent session and silently skips
 * the positional prompt. So cline launches WITHOUT `--id` (a new session), and
 * we recover the id afterwards from cline's sessions database to enable resume.
 *
 * The pure helpers below (parse + pick + strip) are unit-tested; the DB-reading
 * poll runner is integration (verified by running, like cursor-agent's
 * createChat).
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
 * Strip cline's `<user_input mode="…">…</user_input>` wrapper to recover the
 * raw prompt text that was passed as the positional argv. cline wraps every
 * interactive prompt in this tag when persisting it, so the stored prompt is
 * never an exact match for the raw prompt we compare against. If the prompt
 * has no wrapper (e.g. from `cline history --json` which may or may not wrap),
 * it is returned verbatim.
 */
export function stripUserInputWrapper(prompt: string): string {
  const m = prompt.match(/^<user_input[^>]*>([\s\S]*)<\/user_input>$/);
  return m ? m[1] : prompt;
}

/**
 * Identify the session we just launched: an interactive session whose stored
 * prompt — after stripping cline's `<user_input>` wrapper — exactly matches
 * the one we passed (the wrapped prompt is unique per ticket, so this
 * disambiguates from every prior session — and works even with `--worktree`,
 * where cline's cwd is a detached worktree path). Ties (e.g. a re-run of the
 * same ticket) break toward the same cwd, then the newest start. Returns null
 * when nothing matches (caller keeps its placeholder id).
 */
export function pickClineSession(
  entries: ClineHistoryEntry[],
  opts: { cwd: string; prompt: string },
): string | null {
  const matches = entries
    .filter(
      (e) =>
        e.interactive !== false &&
        stripUserInputWrapper(e.prompt ?? "") === opts.prompt,
    )
    .sort((a, b) => {
      const aCwd = a.cwd === opts.cwd || a.workspaceRoot === opts.cwd ? 1 : 0;
      const bCwd = b.cwd === opts.cwd || b.workspaceRoot === opts.cwd ? 1 : 0;
      if (aCwd !== bCwd) return bCwd - aCwd;
      return (b.startedAt ?? "").localeCompare(a.startedAt ?? "");
    });
  return matches[0]?.sessionId ?? null;
}

/** Root of cline's data directory (overridable via `CLINE_DATA_DIR`). */
function clineDataDir(): string {
  return process.env.CLINE_DATA_DIR || join(homedir(), ".cline", "data");
}

/** Path to cline's sessions SQLite database. */
function clineSessionsDbPath(): string {
  return join(clineDataDir(), "db", "sessions.db");
}

/**
 * Read interactive sessions directly from cline's sessions SQLite database.
 * This bypasses `cline history --json`, which tries to start its own hub
 * daemon and fails with `EADDRINUSE` when the hub is already running — which
 * is always the case during an active session (exactly when we need to capture
 * a just-launched session's id). Returns [] if the database doesn't exist or
 * is unreadable.
 */
function readClineSessionsDb(): ClineHistoryEntry[] {
  const dbPath = clineSessionsDbPath();
  if (!existsSync(dbPath)) return [];
  let sqlite: Database.Database | null = null;
  try {
    // Read-only + WAL: safe to read concurrently with cline's own connection.
    sqlite = new Database(dbPath, { readonly: true });
    const rows = sqlite
      .prepare(
        "SELECT session_id AS sessionId, cwd," +
          " workspace_root AS workspaceRoot, interactive," +
          " started_at AS startedAt, prompt" +
          " FROM sessions WHERE interactive = 1" +
          " ORDER BY started_at DESC LIMIT 200",
      )
      .all() as Array<{
      sessionId: string;
      cwd: string;
      workspaceRoot: string;
      interactive: number;
      startedAt: string;
      prompt: string | null;
    }>;
    return rows.map((r) => ({
      sessionId: r.sessionId,
      cwd: r.cwd,
      workspaceRoot: r.workspaceRoot,
      interactive: !!r.interactive,
      startedAt: r.startedAt,
      prompt: r.prompt ?? undefined,
    }));
  } catch {
    return [];
  } finally {
    sqlite?.close();
  }
}

/**
 * Poll cline's sessions database until the session we just launched shows up,
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
    const id = pickClineSession(readClineSessionsDb(), {
      cwd: opts.cwd,
      prompt: opts.prompt,
    });
    if (id) return id;
  }
  return null;
}
