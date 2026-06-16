import { spawn } from "node:child_process";

/** Allow overriding the binary path; defaults to whatever is on PATH. */
export const CURSOR_AGENT_BIN = process.env.CURSOR_AGENT_BIN || "cursor-agent";

const UUID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/**
 * `cursor-agent` emits harmless-but-noisy lines on stderr that get merged into
 * the PTY stream. Drop only lines that FULLY match a known-noise pattern; pass
 * everything else (including ANSI escapes / partial lines) through verbatim so
 * we never reflow or corrupt the interactive TUI rendering.
 */
const NOISE_PATTERNS = [
  /^ERROR: failed to copy trust settings of system certificate/,
  /^Connection lost, reconnecting/,
  /^Retry attempt/,
];

export function filterStderr(chunk: string): string {
  // Split AFTER each newline so line terminators stay attached to their line.
  return chunk
    .split(/(?<=\n)/)
    .filter((line) => !NOISE_PATTERNS.some((re) => re.test(line)))
    .join("");
}

/**
 * Pre-issue a chat UUID via `cursor-agent create-chat`. Prints one UUID to
 * stdout and exits 0 (verified against cursor-agent 2026.06.04). Run in the
 * ticket's working dir so the chat is scoped to the right repo.
 */
export function createChat(cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(CURSOR_AGENT_BIN, ["create-chat"], {
      cwd,
      env: process.env,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", (err) =>
      reject(
        new Error(
          `failed to launch \`${CURSOR_AGENT_BIN} create-chat\`: ${err.message}`,
        ),
      ),
    );
    child.on("close", (code) => {
      const match = stdout.match(UUID_RE);
      if (code === 0 && match) {
        resolve(match[0]);
      } else {
        const detail = filterStderr(stderr).trim() || stdout.trim();
        reject(new Error(`cursor-agent create-chat failed (exit ${code}): ${detail}`));
      }
    });
  });
}

