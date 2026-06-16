// node-pty ships prebuilt `spawn-helper` binaries that can lose their executable
// bit during npm extraction. Without +x, pty.fork() fails with
// "posix_spawnp failed". Re-add it after every install. Best-effort: never fail
// the install, and no-op on platforms without a spawn-helper (e.g. Windows).
import { chmodSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const base = join(process.cwd(), "node_modules", "node-pty", "prebuilds");

try {
  if (existsSync(base)) {
    for (const dir of readdirSync(base)) {
      const helper = join(base, dir, "spawn-helper");
      if (existsSync(helper)) {
        chmodSync(helper, 0o755);
        console.log("[fix-node-pty] chmod +x", helper);
      }
    }
  }
} catch (err) {
  console.warn("[fix-node-pty] skipped:", err instanceof Error ? err.message : err);
}
