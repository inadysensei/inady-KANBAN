import type { Editor } from "../db/schema";

/**
 * "Open with" editor presets, shared by the boot-time seed and the Settings UI.
 * No React, no node APIs — pure data + selection logic, unit-tested.
 *
 * Each `command` runs in a shell with cwd set to the ticket's working dir, so
 * `.` resolves to that directory. The ticket path is never interpolated into
 * the string (no injection surface) — the user owns these commands.
 */
export interface EditorPreset {
  name: string;
  command: string;
  isDefault: boolean;
}

/** Seeded on first boot; all are user-editable/removable afterwards. */
export const DEFAULT_EDITORS: EditorPreset[] = [
  { name: "Cursor (classic)", command: "cursor --classic .", isDefault: true },
  { name: "VS Code", command: "code .", isDefault: false },
  { name: "Emacs", command: "emacs .", isDefault: false },
];

/**
 * The editor a bare "Open with" click should launch: the one flagged default,
 * else the first by list order, else null when there are none configured.
 * (`editors` is expected to arrive already ordered by `position`.)
 */
export function pickDefaultEditor(editors: Editor[]): Editor | null {
  return editors.find((e) => e.isDefault) ?? editors[0] ?? null;
}

/** Trimmed name/command for an editor; both are required and non-blank. */
export function normalizeEditorInput(input: {
  name: string;
  command: string;
}): { name: string; command: string } {
  const name = input.name.trim();
  const command = input.command.trim();
  if (!name) throw new Error("editor name is required");
  if (!command) throw new Error("editor command is required");
  return { name, command };
}
