"use server";

import { spawn } from "node:child_process";
import { eq, max } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { repositories } from "@/db/schema";
import { assertValidWorkingDir, cleanChosenFolderPath } from "@/lib/working-dirs";

function revalidate(): void {
  revalidatePath("/settings");
  revalidatePath("/");
}

export async function addRepository(path: string): Promise<{ id: string }> {
  // Normalize like the folder picker does (trim + drop trailing slash) so a
  // hand-typed "…/code/" can't slip past the unique constraint as a near-dupe.
  const trimmed = cleanChosenFolderPath(path);
  await assertValidWorkingDir(trimmed);
  const existing = db
    .select()
    .from(repositories)
    .where(eq(repositories.path, trimmed))
    .get();
  if (existing) throw new Error("repository already added");

  const now = Date.now();
  const last = db.select({ p: max(repositories.position) }).from(repositories).get();
  const id = crypto.randomUUID();
  db.insert(repositories)
    .values({ id, path: trimmed, position: (last?.p ?? 0) + 1, createdAt: now, updatedAt: now })
    .run();
  revalidate();
  return { id };
}

export async function updateRepository(id: string, path: string): Promise<void> {
  const trimmed = cleanChosenFolderPath(path);
  await assertValidWorkingDir(trimmed);
  const conflict = db
    .select()
    .from(repositories)
    .where(eq(repositories.path, trimmed))
    .get();
  if (conflict && conflict.id !== id) {
    throw new Error("another repository already uses that path");
  }
  db.update(repositories)
    .set({ path: trimmed, updatedAt: Date.now() })
    .where(eq(repositories.id, id))
    .run();
  revalidate();
}

export async function removeRepository(id: string): Promise<void> {
  db.delete(repositories).where(eq(repositories.id, id)).run();
  revalidate();
}

export type PickDirectoryResult = { path: string } | { canceled: true };

/**
 * Open the OS-native folder chooser and return the picked absolute path. macOS
 * only (uses `osascript`'s `choose folder`); on other platforms the caller
 * falls back to direct path entry. A cancelled dialog resolves to
 * `{ canceled: true }` rather than throwing.
 */
export async function pickRepositoryDirectory(): Promise<PickDirectoryResult> {
  if (process.platform !== "darwin") {
    throw new Error(
      "The folder browser is only available on macOS — type the path directly.",
    );
  }
  const path = await chooseFolderViaOsascript();
  if (!path) return { canceled: true };
  return { path };
}

function chooseFolderViaOsascript(): Promise<string> {
  return new Promise((resolve, reject) => {
    // A bare `choose folder` (no System Events `tell`) needs no Automation/TCC
    // permission — wrapping it in `tell application "System Events"` would
    // prompt for, or fail (-1743) without, that permission. The file dialog
    // still opens frontmost. It blocks until the user picks or cancels.
    const child = spawn("osascript", [
      "-e",
      'POSIX path of (choose folder with prompt "Select a repository folder")',
    ]);
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d.toString()));
    child.stderr.on("data", (d) => (err += d.toString()));
    child.on("error", (e) =>
      reject(new Error(`could not open the folder browser: ${e.message}`)),
    );
    child.on("close", (code) => {
      if (code === 0) return resolve(cleanChosenFolderPath(out));
      // Cancel → osascript exits non-zero with "User canceled. (-128)".
      if (/-128|user canceled/i.test(err)) return resolve("");
      reject(new Error(err.trim() || `folder browser exited with code ${code}`));
    });
  });
}
