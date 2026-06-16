import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";

/** sessionDbId → OS pid of the cursor-agent PTY leader */
export type PidRecord = Record<string, number>;

const PID_FILE = resolve(process.cwd(), "data", "live-agent-pids.json");
const PID_FILE_TMP = `${PID_FILE}.tmp`;

export function upsertPidRecord(
  records: PidRecord,
  sessionDbId: string,
  pid: number,
): PidRecord {
  return { ...records, [sessionDbId]: pid };
}

export function omitPidRecord(
  records: PidRecord,
  sessionDbId: string,
): PidRecord {
  const next = { ...records };
  delete next[sessionDbId];
  return next;
}

function ensurePidFileDir(): void {
  mkdirSync(dirname(PID_FILE), { recursive: true });
}

export function readPidRecords(): PidRecord {
  if (!existsSync(PID_FILE)) return {};
  try {
    const raw = readFileSync(PID_FILE, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: PidRecord = {};
    for (const [id, pid] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof pid === "number" && Number.isInteger(pid) && pid > 0) {
        out[id] = pid;
      }
    }
    return out;
  } catch {
    return {};
  }
}

function writePidRecords(records: PidRecord): void {
  ensurePidFileDir();
  writeFileSync(PID_FILE_TMP, JSON.stringify(records));
  renameSync(PID_FILE_TMP, PID_FILE);
}

export function recordAgentPid(sessionDbId: string, pid: number): void {
  writePidRecords(upsertPidRecord(readPidRecords(), sessionDbId, pid));
}

export function removeAgentPid(sessionDbId: string): void {
  writePidRecords(omitPidRecord(readPidRecords(), sessionDbId));
}

export function clearPidRecords(): void {
  if (existsSync(PID_FILE)) unlinkSync(PID_FILE);
}
