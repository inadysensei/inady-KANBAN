import { spawn } from "node:child_process";
import {
  MAX_DIFF_BYTES,
  type DiffPayload,
  parseNulList,
} from "./diff-view";

/**
 * The server's git integration for the in-board diff panel. Runs `git diff HEAD`
 * (what changed in tracked files) plus `git ls-files --others` (what the agent
 * newly created — invisible to `git diff HEAD`) against a ticket's working dir.
 *
 * node:child_process lives STRICTLY here, imported only by server.ts — never by
 * a Server Action or a client component — so node-pty/child_process stay out of
 * the client bundle (same rule pty-registry follows). The pure parsing/types are
 * in diff-view.ts; this file is the integration edge, verified by running.
 */

// Untracked output is just filenames; cap it well below the diff cap. Past this
// the list is simply truncated — a working dir with this many new files is
// already past "review at a glance".
const MAX_UNTRACKED_BYTES = 256_000;
// Don't let a hung `git` wedge the request forever.
const GIT_TIMEOUT_MS = 15_000;

interface GitRun {
  /** spawn-level failure (e.g. git not on PATH) — distinct from a non-zero exit. */
  spawnError: string | null;
  /** Process exit code; null when killed (signal) or never spawned. */
  code: number | null;
  /** Captured stdout, decoded and byte-capped. */
  stdout: string;
  /** True when stdout hit the byte cap and the child was killed early. */
  truncated: boolean;
}

/**
 * Spawn `git <args>`, streaming stdout with a hard byte cap (the readBody
 * pattern from server.ts): once `capBytes` is reached we keep the prefix, kill
 * the child, and flag `truncated`. Never rejects — every failure mode resolves
 * to a GitRun the caller classifies.
 */
function runGit(args: string[], capBytes: number): Promise<GitRun> {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (run: GitRun) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(run);
    };

    let child: ReturnType<typeof spawn>;
    try {
      child = spawn("git", args, { windowsHide: true });
    } catch (err) {
      settle({
        spawnError: err instanceof Error ? err.message : String(err),
        code: null,
        stdout: "",
        truncated: false,
      });
      return;
    }

    const chunks: Buffer[] = [];
    let bytes = 0;
    let truncated = false;

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      settle({
        spawnError: "git timed out",
        code: null,
        stdout: Buffer.concat(chunks).toString("utf8"),
        truncated,
      });
    }, GIT_TIMEOUT_MS);

    child.stdout?.on("data", (chunk: Buffer) => {
      if (truncated) return;
      if (bytes + chunk.length > capBytes) {
        // Slice on the byte boundary, so the final decoded char may be a partial
        // UTF-8 codepoint (a U+FFFD at the very end). Cosmetic and bounded — the
        // truncated tail is already a "open your editor for the rest" affordance,
        // and parseDiff is total over any input. Same property as readBody.
        chunks.push(chunk.subarray(0, capBytes - bytes));
        bytes = capBytes;
        truncated = true;
        child.kill(); // we have enough; stop git early
        return;
      }
      chunks.push(chunk);
      bytes += chunk.length;
    });
    // Drain stderr so the pipe never blocks the child, but don't act on its text
    // — control flow keys off the exit code (locale-independent), not messages.
    child.stderr?.resume();

    child.on("error", (err) => {
      settle({
        spawnError: err.message,
        code: null,
        stdout: "",
        truncated: false,
      });
    });
    child.on("close", (code) => {
      settle({
        spawnError: null,
        code,
        stdout: Buffer.concat(chunks).toString("utf8"),
        truncated,
      });
    });
  });
}

/**
 * Collect the reviewable change set for a working dir. Classification keys off
 * the process outcome, not stderr text (git messages are localized):
 *   - spawn error (git missing)         → "error"
 *   - `git diff HEAD` exits 0 / truncated → "ok" (truncated still has a prefix)
 *   - any non-zero exit (not a repo, no commits yet, missing dir) → "not-applicable"
 * Untracked files are fetched best-effort only when the repo is diffable.
 */
export async function collectTicketDiff(
  workingDir: string,
): Promise<DiffPayload> {
  const diff = await runGit(
    // --no-ext-diff forces git's internal unified diff: a repo with a
    // `diff.external` driver would otherwise emit a non-unified format parseDiff
    // can't read (and would run that configured command). --no-color keeps ANSI
    // codes out even under `color.ui = always`.
    ["-C", workingDir, "--no-pager", "diff", "--no-color", "--no-ext-diff", "HEAD"],
    MAX_DIFF_BYTES,
  );

  if (diff.spawnError !== null) {
    return {
      status: "error",
      diff: "",
      truncated: false,
      untracked: [],
      error: diff.spawnError,
    };
  }
  // A clean exit OR a truncation (we killed git after enough bytes) is a usable
  // diff; only a genuine non-zero exit means "can't diff this dir".
  if (!diff.truncated && diff.code !== 0) {
    return { status: "not-applicable", diff: "", truncated: false, untracked: [] };
  }

  const others = await runGit(
    ["-C", workingDir, "--no-pager", "ls-files", "-z", "--others", "--exclude-standard"],
    MAX_UNTRACKED_BYTES,
  );
  const untracked =
    others.spawnError === null && others.code === 0
      ? parseNulList(others.stdout)
      : [];

  return { status: "ok", diff: diff.stdout, truncated: diff.truncated, untracked };
}
