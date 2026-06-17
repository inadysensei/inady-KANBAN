/**
 * Regenerate src/lib/cursor-models.generated.json from the live cursor CLI.
 *
 * Runs `cursor-agent --list-models`, parses stdout via the same pure
 * `parseCursorModelList` the app uses, and writes the catalog as pretty JSON.
 * Run locally with `npm run sync:cursor-models`; a daily GitHub Action runs it
 * and opens a PR when the catalog changes (.github/workflows/sync-cursor-models.yml).
 *
 * Needs an authenticated cursor CLI on PATH (CURSOR_API_KEY in CI). Exits
 * non-zero if the CLI errors or returns no models, so CI surfaces a breakage
 * instead of committing an empty catalog.
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { CURSOR_AGENT_BIN } from "../src/lib/cursor-agent";
import { parseCursorModelList } from "../src/lib/cursor-models";

const OUT_FILE = resolve(
  process.cwd(),
  "src",
  "lib",
  "cursor-models.generated.json",
);

function main(): void {
  let stdout: string;
  try {
    stdout = execFileSync(CURSOR_AGENT_BIN, ["--list-models"], {
      encoding: "utf8",
      // stderr → inherit so the harmless trust-cert noise is visible but never
      // mixed into the stdout we parse.
      stdio: ["ignore", "pipe", "inherit"],
      // Fail fast if the CLI hangs (e.g. a missing/invalid CURSOR_API_KEY
      // blocking on an interactive auth path in CI) rather than running to the
      // job's wall-clock limit.
      timeout: 60_000,
    });
  } catch (err) {
    console.error(
      `\`${CURSOR_AGENT_BIN} --list-models\` failed: ${(err as Error).message}`,
    );
    process.exit(1);
  }

  const models = parseCursorModelList(stdout);
  if (models.length === 0) {
    console.error("No models parsed from --list-models output; aborting.");
    process.exit(1);
  }

  writeFileSync(OUT_FILE, `${JSON.stringify(models, null, 2)}\n`);
  console.error(`Wrote ${models.length} cursor models to ${OUT_FILE}`);
}

main();
