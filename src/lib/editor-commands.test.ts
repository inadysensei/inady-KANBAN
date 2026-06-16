import { describe, expect, test } from "vitest";
import type { Editor } from "../db/schema";
import {
  DEFAULT_EDITORS,
  normalizeEditorInput,
  pickDefaultEditor,
} from "./editor-commands";

function editor(partial: Partial<Editor>): Editor {
  return {
    id: partial.id ?? "id",
    name: partial.name ?? "Editor",
    command: partial.command ?? "code .",
    isDefault: partial.isDefault ?? false,
    position: partial.position ?? 0,
    createdAt: 0,
    updatedAt: 0,
  };
}

describe("DEFAULT_EDITORS", () => {
  test("has exactly one default, and it is Cursor classic", () => {
    const defaults = DEFAULT_EDITORS.filter((e) => e.isDefault);
    expect(defaults).toHaveLength(1);
    expect(defaults[0]).toMatchObject({ command: "cursor --classic ." });
  });
});

describe("pickDefaultEditor", () => {
  test("returns the flagged default over list order", () => {
    const editors = [
      editor({ id: "a", isDefault: false }),
      editor({ id: "b", isDefault: true }),
    ];
    expect(pickDefaultEditor(editors)?.id).toBe("b");
  });

  test("falls back to the first when none is flagged", () => {
    const editors = [editor({ id: "a" }), editor({ id: "b" })];
    expect(pickDefaultEditor(editors)?.id).toBe("a");
  });

  test("returns null for an empty list", () => {
    expect(pickDefaultEditor([])).toBeNull();
  });
});

describe("normalizeEditorInput", () => {
  test("trims name and command", () => {
    expect(normalizeEditorInput({ name: "  VS Code ", command: " code . " })).toEqual(
      { name: "VS Code", command: "code ." },
    );
  });

  test("rejects a blank name", () => {
    expect(() => normalizeEditorInput({ name: "  ", command: "code ." })).toThrow(
      /name is required/,
    );
  });

  test("rejects a blank command", () => {
    expect(() => normalizeEditorInput({ name: "VS Code", command: " " })).toThrow(
      /command is required/,
    );
  });
});
