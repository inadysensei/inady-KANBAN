export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code !== "ESRCH";
  }
}

/** SIGTERM now; SIGKILL after graceMs (non-blocking). */
export function scheduleProcessTermination(
  pid: number,
  graceMs: number,
): void {
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    return;
  }
  setTimeout(() => {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // already dead
    }
  }, graceMs);
}
