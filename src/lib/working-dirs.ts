import { stat } from "node:fs/promises";
import { isAbsolute } from "node:path";

/**
 * Normalize a list of candidate paths into selectable working directories:
 * non-empty, absolute, de-duplicated paths in first-seen order. Anything else
 * (non-array input, non-strings, blanks, relative paths) is dropped so the UI
 * only ever offers a path the create action will accept. Used both for the
 * DB-backed repository list and the one-shot import of the legacy
 * `data/working-dirs.json` file.
 */
export function parseWorkingDirs(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const path = item.trim();
    if (!path || !isAbsolute(path) || seen.has(path)) continue;
    seen.add(path);
    out.push(path);
  }
  return out;
}

/**
 * `osascript`'s `choose folder` returns a POSIX path with a trailing slash and
 * a newline (e.g. `/Users/me/code/\n`). Trim to the canonical absolute path the
 * repository list expects. Returns "" for empty/whitespace input (e.g. a
 * cancelled dialog), and only strips the trailing slash for non-root paths.
 */
export function cleanChosenFolderPath(raw: string): string {
  const path = raw.trim();
  if (!path) return "";
  return path.length > 1 && path.endsWith("/") ? path.replace(/\/+$/, "") : path;
}

/**
 * Shared working-dir guard for the ticket/template/repository create+update
 * actions: must be an absolute path to an existing directory. Server-only
 * (touches the filesystem); throws a user-facing message on failure.
 */
export async function assertValidWorkingDir(workingDir: string): Promise<void> {
  if (!workingDir || !isAbsolute(workingDir)) {
    throw new Error("working_dir must be an absolute path");
  }
  let info;
  try {
    info = await stat(workingDir);
  } catch {
    throw new Error(`working_dir does not exist: ${workingDir}`);
  }
  if (!info.isDirectory()) {
    throw new Error(`working_dir is not a directory: ${workingDir}`);
  }
}
