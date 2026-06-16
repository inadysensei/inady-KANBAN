"use server";

import { spawn } from "node:child_process";
import { asc, count, eq, max, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { editors, tickets } from "@/db/schema";
import { normalizeEditorInput, pickDefaultEditor } from "@/lib/editor-commands";
import { listEditors } from "@/lib/inady-kanban-config";
import { assertValidWorkingDir } from "@/lib/working-dirs";

function revalidate(): void {
  revalidatePath("/settings");
  revalidatePath("/");
}

export async function saveEditor(input: {
  id?: string;
  name: string;
  command: string;
  isDefault?: boolean;
}): Promise<{ id: string }> {
  const { name, command } = normalizeEditorInput(input);
  const now = Date.now();
  const id = input.id ?? crypto.randomUUID();

  db.transaction((tx) => {
    let shouldBeDefault = Boolean(input.isDefault);
    if (input.id) {
      const existing = tx
        .select()
        .from(editors)
        .where(eq(editors.id, input.id))
        .get();
      if (!existing) throw new Error("editor not found");
      tx.update(editors)
        .set({ name, command, isDefault: shouldBeDefault, updatedAt: now })
        .where(eq(editors.id, input.id))
        .run();
    } else {
      // The very first editor is the default no matter what — there must always
      // be one for a bare "Open with" click.
      const empty =
        (tx.select({ value: count() }).from(editors).get()?.value ?? 0) === 0;
      shouldBeDefault = shouldBeDefault || empty;
      const last = tx.select({ p: max(editors.position) }).from(editors).get();
      tx.insert(editors)
        .values({
          id,
          name,
          command,
          isDefault: shouldBeDefault,
          position: (last?.p ?? 0) + 1,
          createdAt: now,
          updatedAt: now,
        })
        .run();
    }
    if (shouldBeDefault) {
      // Exactly one default: clear the flag on every other row.
      tx.update(editors)
        .set({ isDefault: false, updatedAt: now })
        .where(ne(editors.id, id))
        .run();
    } else {
      // Editing the last default away (unchecking "Default" on the only one
      // flagged) would leave none — re-promote the first row so a bare
      // "Open with" click always has a target. pickDefaultEditor returns the
      // first by order when nothing is flagged.
      const remaining = tx
        .select()
        .from(editors)
        .orderBy(asc(editors.position))
        .all();
      const promote = pickDefaultEditor(remaining);
      if (promote && !remaining.some((e) => e.isDefault)) {
        tx.update(editors)
          .set({ isDefault: true, updatedAt: now })
          .where(eq(editors.id, promote.id))
          .run();
      }
    }
  });
  revalidate();
  return { id };
}

export async function deleteEditor(id: string): Promise<void> {
  db.transaction((tx) => {
    tx.delete(editors).where(eq(editors.id, id)).run();
    // Keep a default alive: if we removed it, promote the first remaining row.
    const remaining = tx
      .select()
      .from(editors)
      .orderBy(asc(editors.position))
      .all();
    if (remaining.length > 0 && !remaining.some((e) => e.isDefault)) {
      tx.update(editors)
        .set({ isDefault: true, updatedAt: Date.now() })
        .where(eq(editors.id, remaining[0].id))
        .run();
    }
  });
  revalidate();
}

export async function setDefaultEditor(id: string): Promise<void> {
  const now = Date.now();
  db.transaction((tx) => {
    const existing = tx.select().from(editors).where(eq(editors.id, id)).get();
    if (!existing) throw new Error("editor not found");
    tx.update(editors).set({ isDefault: false, updatedAt: now }).run();
    tx.update(editors)
      .set({ isDefault: true, updatedAt: now })
      .where(eq(editors.id, id))
      .run();
  });
  revalidate();
}

/**
 * Launch an editor on a ticket's working directory. Runs the editor's command
 * in a shell with cwd set to the working dir (so `.` resolves there), detached
 * so the editor outlives this request. The path is never interpolated into the
 * command string. With no `editorId`, the configured default is used.
 */
export async function openInEditor(
  ticketId: string,
  editorId?: string,
): Promise<void> {
  const ticket = db.select().from(tickets).where(eq(tickets.id, ticketId)).get();
  if (!ticket) throw new Error("ticket not found");
  await assertValidWorkingDir(ticket.workingDir);

  const all = listEditors();
  const editor = editorId
    ? all.find((e) => e.id === editorId)
    : pickDefaultEditor(all);
  if (!editor) throw new Error("no editor configured — add one in Settings");

  const child = spawn(editor.command, {
    cwd: ticket.workingDir,
    shell: true,
    detached: true,
    stdio: "ignore",
    env: process.env,
  });
  // A GUI editor; we don't await it. Swallow spawn errors so a bad command
  // can't crash the request (stdio is ignored, so we can't surface much anyway).
  child.on("error", () => {});
  child.unref();
}
