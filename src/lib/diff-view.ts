/**
 * Pure helpers for the in-board diff review panel — no React, no node, so they
 * load in the client bundle (DiffPanel) AND in both server module graphs (the
 * git runner uses the byte cap, server.ts serializes the shared types). The
 * side effects — spawning git, fetching, rendering — live elsewhere.
 */

/**
 * Byte cap for one diff payload. Mirrors server.ts's MAX_BODY_BYTES: a runaway
 * diff (generated files, vendored trees) shouldn't buffer unbounded memory on
 * the server or freeze the browser. Past this the diff is truncated and the UI
 * offers an "open in editor" fallback. Lives here so the server runner and the
 * client share one number.
 */
export const MAX_DIFF_BYTES = 1_000_000;

/** Outcome of a ticket diff request, shared by the server route and the client. */
export type DiffStatus =
  // A diff was produced (possibly empty, possibly truncated).
  | "ok"
  // The working dir isn't a git repo, has no commits yet, or is otherwise not
  // diffable — render as "no tracked changes", not an error.
  | "not-applicable"
  // git couldn't run at all (e.g. not installed). Surfaced to the user.
  | "error";

/** The JSON body of GET /api/tickets/:id/diff (when the request itself is ok). */
export interface DiffPayload {
  status: DiffStatus;
  /** Raw `git diff HEAD` output (unified format), possibly truncated. */
  diff: string;
  /** True when `diff` was cut at MAX_DIFF_BYTES. */
  truncated: boolean;
  /** Untracked files (`git ls-files --others`) — what the agent newly created,
   *  which `git diff HEAD` alone never shows. */
  untracked: string[];
  /** Human-readable message when status is "error". */
  error?: string;
}

export type DiffLineType = "add" | "del" | "context" | "hunk";

export interface DiffLine {
  type: DiffLineType;
  /** The original line, leading marker (`+`/`-`/space/`@`) included. */
  text: string;
}

export interface DiffFile {
  /** Best display path: the new name, falling back to the old (for deletes). */
  path: string;
  /** Pre-change path; null when the file is newly added (old side /dev/null). */
  oldPath: string | null;
  /** Post-change path; null when the file is deleted (new side /dev/null). */
  newPath: string | null;
  additions: number;
  deletions: number;
  /** A binary file — git emits no line-by-line diff, so there's nothing to color. */
  binary: boolean;
  /** Hunk headers + body lines (file-header noise like `index`/`---` removed). */
  lines: DiffLine[];
}

const DIFF_GIT_RE = /^diff --git a\/(.*) b\/(.*)$/;

/** A path is "real" when it names a file (not the /dev/null add/delete sentinel). */
function isRealPath(path: string | null): path is string {
  return path !== null && path !== "" && path !== "/dev/null";
}

/** Strip git's `a/` / `b/` path prefix if present (default, non-`--no-prefix` diffs). */
function stripPrefix(path: string, prefix: string): string {
  return path.startsWith(prefix) ? path.slice(prefix.length) : path;
}

function displayPath(oldPath: string | null, newPath: string | null): string {
  if (isRealPath(newPath)) return newPath;
  if (isRealPath(oldPath)) return oldPath;
  return "(unknown)";
}

/**
 * Parse `git diff HEAD` output into per-file structures for the renderer. Pure
 * and total: any input (including a stream truncated mid-line) yields a value,
 * never a throw. File-header noise (`index`, mode lines, `---`/`+++`) is dropped
 * — the file's path is shown from the parsed header instead — while hunk headers
 * (`@@`) and body lines (`+`/`-`/context) are kept for coloring.
 */
export function parseDiff(raw: string): DiffFile[] {
  const files: DiffFile[] = [];
  let current: DiffFile | null = null;

  const finalize = () => {
    if (!current) return;
    current.path = displayPath(current.oldPath, current.newPath);
    files.push(current);
  };

  const lines = raw.split("\n");
  // Drop the single empty element a trailing newline leaves, so it doesn't
  // become a stray context line on the last file.
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();

  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      finalize();
      const m = DIFF_GIT_RE.exec(line);
      current = {
        path: "",
        oldPath: m ? m[1] : null,
        newPath: m ? m[2] : null,
        additions: 0,
        deletions: 0,
        binary: false,
        lines: [],
      };
      continue;
    }
    // Ignore any preamble before the first file header.
    if (!current) continue;

    // The real paths (more reliable than the diff --git line for names with
    // spaces). `--- ` / `+++ ` must be checked before the `-` / `+` body rules.
    if (line.startsWith("--- ")) {
      const p = line.slice(4);
      current.oldPath = p === "/dev/null" ? null : stripPrefix(p, "a/");
      continue;
    }
    if (line.startsWith("+++ ")) {
      const p = line.slice(4);
      current.newPath = p === "/dev/null" ? null : stripPrefix(p, "b/");
      continue;
    }
    if (line.startsWith("rename from ")) {
      current.oldPath = line.slice("rename from ".length);
      continue;
    }
    if (line.startsWith("rename to ")) {
      current.newPath = line.slice("rename to ".length);
      continue;
    }
    if (line.startsWith("copy from ")) {
      current.oldPath = line.slice("copy from ".length);
      continue;
    }
    if (line.startsWith("copy to ")) {
      current.newPath = line.slice("copy to ".length);
      continue;
    }
    if (line.startsWith("Binary files ")) {
      current.binary = true;
      continue;
    }
    if (line.startsWith("@@")) {
      current.lines.push({ type: "hunk", text: line });
      continue;
    }
    // Remaining file-header / metadata noise — not part of the colored body.
    if (
      line.startsWith("index ") ||
      line.startsWith("new file mode ") ||
      line.startsWith("deleted file mode ") ||
      line.startsWith("old mode ") ||
      line.startsWith("new mode ") ||
      line.startsWith("similarity index ") ||
      line.startsWith("dissimilarity index ") ||
      line.startsWith("\\ ") // "\ No newline at end of file"
    ) {
      continue;
    }
    // Hunk body.
    if (line.startsWith("+")) {
      current.lines.push({ type: "add", text: line });
      current.additions++;
      continue;
    }
    if (line.startsWith("-")) {
      current.lines.push({ type: "del", text: line });
      current.deletions++;
      continue;
    }
    current.lines.push({ type: "context", text: line });
  }
  finalize();
  return files;
}

/**
 * Split a NUL-separated list (`git ls-files -z`) into entries, dropping empties.
 * `-z` is used precisely so paths with spaces/newlines need no unquoting.
 */
export function parseNulList(raw: string): string[] {
  return raw.split("\0").filter((entry) => entry.length > 0);
}
