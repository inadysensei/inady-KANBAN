import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { count, eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import { appSettings, editors, repositories, tags } from "../db/schema";
import { SETTINGS_ROW_ID } from "./app-settings";
import { DEFAULT_EDITORS } from "./editor-commands";
import { DEFAULT_TAGS } from "./tags";
import { parseWorkingDirs } from "./working-dirs";

const LEGACY_WORKING_DIRS_FILE = resolve(
  process.cwd(),
  "data",
  "working-dirs.json",
);

function tableIsEmpty(
  table: typeof repositories | typeof editors | typeof tags,
): boolean {
  return (db.select({ value: count() }).from(table).get()?.value ?? 0) === 0;
}

function importLegacyWorkingDirs(now: number): number {
  if (!existsSync(LEGACY_WORKING_DIRS_FILE) || !tableIsEmpty(repositories)) {
    return 0;
  }
  let paths: string[];
  try {
    paths = parseWorkingDirs(JSON.parse(readFileSync(LEGACY_WORKING_DIRS_FILE, "utf8")));
  } catch {
    return 0;
  }
  paths.forEach((path, i) => {
    db.insert(repositories)
      .values({
        id: crypto.randomUUID(),
        path,
        position: i + 1,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  });
  return paths.length;
}

function seedDefaultEditors(now: number): number {
  if (!tableIsEmpty(editors)) return 0;
  DEFAULT_EDITORS.forEach((preset, i) => {
    db.insert(editors)
      .values({
        id: crypto.randomUUID(),
        name: preset.name,
        command: preset.command,
        isDefault: preset.isDefault,
        position: i + 1,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  });
  return DEFAULT_EDITORS.length;
}

function seedDefaultTags(now: number): number {
  if (!tableIsEmpty(tags)) return 0;
  DEFAULT_TAGS.forEach((preset, i) => {
    db.insert(tags)
      .values({
        id: crypto.randomUUID(),
        name: preset.name,
        color: preset.color,
        position: i + 1,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  });
  return DEFAULT_TAGS.length;
}

/**
 * Idempotent boot migration: the legacy `review` status was folded into `doing`
 * (the board now runs To Do → Doing → WIP → Done). Any ticket still parked in the
 * dropped column is moved to Doing so it groups cleanly on the board. Raw SQL on
 * purpose — `"review"` is no longer part of the `TicketStatus` type, so drizzle's
 * typed query builder can't express it. Runs every boot (outside the `seeded`
 * guard, since already-seeded installs are exactly where legacy rows live) and is
 * a no-op once converted. Errors are swallowed by the caller's try/catch.
 */
export function migrateLegacyTicketStatuses(): number {
  const result = db.run(
    sql`UPDATE tickets SET status = 'doing' WHERE status = 'review'`,
  );
  return result.changes;
}

/**
 * One-shot defaults seeding, run once at server boot (server.ts). Imports the
 * legacy `data/working-dirs.json` file into the `repositories` table and seeds
 * the default "Open with" editors. Guarded by `app_settings.seeded` so it never
 * re-runs — clearing the lists in Settings stays cleared. Safe to call before
 * `db:push` has been run for the first time: any error is swallowed (the boot
 * sweep logs a hint), so the server still starts.
 */
export function bootstrapDefaults(): {
  repositories: number;
  editors: number;
  tags: number;
} {
  const result = { repositories: 0, editors: 0, tags: 0 };
  try {
    const row = db
      .select()
      .from(appSettings)
      .where(eq(appSettings.id, SETTINGS_ROW_ID))
      .get();
    if (row?.seeded) return result;

    const now = Date.now();
    result.repositories = importLegacyWorkingDirs(now);
    result.editors = seedDefaultEditors(now);
    result.tags = seedDefaultTags(now);

    if (row) {
      db.update(appSettings)
        .set({ seeded: 1, updatedAt: now })
        .where(eq(appSettings.id, SETTINGS_ROW_ID))
        .run();
    } else {
      db.insert(appSettings)
        .values({ id: SETTINGS_ROW_ID, seeded: 1, updatedAt: now })
        .run();
    }
  } catch (err) {
    console.warn(
      `[boot] could not seed defaults (${(err as Error).message}). Run \`npm run db:push\`.`,
    );
  }
  return result;
}
