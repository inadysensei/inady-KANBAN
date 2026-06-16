import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

const DB_PATH = resolve(process.cwd(), "data", "kanban.db");

type Db = ReturnType<typeof createDb>;

function createDb() {
  mkdirSync(dirname(DB_PATH), { recursive: true });
  const sqlite = new Database(DB_PATH);
  // Wait (up to 5s) instead of throwing SQLITE_BUSY if another connection
  // (e.g. drizzle-kit studio) briefly holds a lock.
  sqlite.pragma("busy_timeout = 5000");
  sqlite.pragma("journal_mode = WAL");
  // SQLite defaults foreign keys OFF — turn it on so ON DELETE CASCADE works.
  sqlite.pragma("foreign_keys = ON");
  return drizzle(sqlite, { schema });
}

// The custom server (tsx) and Next's bundled Server Actions are two module
// graphs in the SAME process. Cache the handle on globalThis so both share one
// better-sqlite3 connection (synchronous + single-threaded, so this is safe).
const globalForDb = globalThis as unknown as { __inadyKanbanDb?: Db };

function getDb(): Db {
  if (!globalForDb.__inadyKanbanDb) globalForDb.__inadyKanbanDb = createDb();
  return globalForDb.__inadyKanbanDb;
}

// Lazy proxy: the connection is opened on first real use, NOT at import time.
// This keeps `next build`'s page-data collection (which only imports modules to
// read their config) from opening competing connections across build workers.
export const db = new Proxy({} as Db, {
  get(_target, prop, receiver) {
    const real = getDb();
    const value = Reflect.get(real as object, prop, receiver);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export { schema };
