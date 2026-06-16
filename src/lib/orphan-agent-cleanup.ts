import { clearPidRecords, readPidRecords } from "./agent-pid-store";
import {
  isProcessAlive,
  scheduleProcessTermination,
} from "./process-terminate";

const BOOT_KILL_GRACE_MS = 2000;

/**
 * On boot, stop cursor-agent processes recorded before a crash/restart and
 * clear the pid file. Does not touch unrelated cursor-agent invocations.
 */
export function sweepOrphanAgentProcesses(): number {
  const records = readPidRecords();
  const pids = [...new Set(Object.values(records))];
  let swept = 0;
  for (const pid of pids) {
    if (isProcessAlive(pid)) {
      scheduleProcessTermination(pid, BOOT_KILL_GRACE_MS);
      swept++;
    }
  }
  clearPidRecords();
  return swept;
}
