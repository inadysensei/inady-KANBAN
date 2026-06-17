import { describe, expect, it } from "vitest";
import {
  CURSOR_MODEL_CATALOG,
  DEFAULT_CURSOR_MODELS,
  FALLBACK_CURSOR_MODEL,
  addCursorModel,
  availableCursorModelsToAdd,
  cursorModelLabel,
  cursorModelOptions,
  defaultCursorModel,
  isKnownCursorModel,
  moveCursorModel,
  normalizeCursorModelSelection,
  parseCursorModelList,
  parseCursorModelSelection,
  removeCursorModel,
  resolveCursorModel,
  serializeCursorModelSelection,
  setDefaultCursorModel,
  type CursorModelCatalogEntry,
} from "./cursor-models";

const CATALOG: CursorModelCatalogEntry[] = [
  { id: "composer-2.5", label: "Composer 2.5" },
  { id: "auto", label: "Auto" },
  { id: "gpt-5.3-codex-high", label: "Codex 5.3 High" },
];

describe("parseCursorModelList", () => {
  it("parses `id - label` lines and skips the header, blanks, and the Tip trailer", () => {
    const stdout = [
      "Available models",
      "",
      "auto - Auto",
      "gpt-5.3-codex-high - Codex 5.3 High",
      "composer-2.5 - Composer 2.5",
      "",
      "Tip: use --model <id> (or /model <id> in interactive mode) to switch.",
    ].join("\n");
    expect(parseCursorModelList(stdout)).toEqual([
      { id: "auto", label: "Auto" },
      { id: "gpt-5.3-codex-high", label: "Codex 5.3 High" },
      { id: "composer-2.5", label: "Composer 2.5" },
    ]);
  });

  it("drops stderr noise lines that get interleaved (stdout-only contract)", () => {
    const stdout = [
      "ERROR: failed to copy trust settings of system certificate-25291",
      "auto - Auto",
    ].join("\n");
    expect(parseCursorModelList(stdout)).toEqual([{ id: "auto", label: "Auto" }]);
  });

  it("strips the transient (current)/(default) markers but keeps other parentheticals", () => {
    const stdout = [
      "gpt-5.2 - GPT-5.2 (current)",
      "composer-2.5-fast - Composer 2.5 Fast (default)",
      "claude-fable-5-low - Fable 5 1M Low (NO ZDR)",
    ].join("\n");
    expect(parseCursorModelList(stdout)).toEqual([
      { id: "gpt-5.2", label: "GPT-5.2" },
      { id: "composer-2.5-fast", label: "Composer 2.5 Fast" },
      { id: "claude-fable-5-low", label: "Fable 5 1M Low (NO ZDR)" },
    ]);
  });

  it("de-duplicates by id (first wins)", () => {
    const stdout = ["auto - Auto", "auto - Auto Again"].join("\n");
    expect(parseCursorModelList(stdout)).toEqual([{ id: "auto", label: "Auto" }]);
  });
});

describe("generated catalog", () => {
  it("is non-empty and includes the default ids", () => {
    const ids = new Set(CURSOR_MODEL_CATALOG.map((m) => m.id));
    expect(CURSOR_MODEL_CATALOG.length).toBeGreaterThan(0);
    expect(ids.has("composer-2.5")).toBe(true);
    expect(ids.has("auto")).toBe(true);
  });
});

describe("normalizeCursorModelSelection / parseCursorModelSelection", () => {
  it("falls back to the default selection on empty/malformed input", () => {
    expect(parseCursorModelSelection(null)).toEqual(DEFAULT_CURSOR_MODELS);
    expect(parseCursorModelSelection("not json")).toEqual(DEFAULT_CURSOR_MODELS);
    expect(parseCursorModelSelection("{}")).toEqual(DEFAULT_CURSOR_MODELS);
    expect(normalizeCursorModelSelection([])).toEqual(DEFAULT_CURSOR_MODELS);
    // the returned default is a copy, not the shared constant
    expect(parseCursorModelSelection(null)).not.toBe(DEFAULT_CURSOR_MODELS);
  });

  it("keeps order, drops bad entries and dup ids, coerces default", () => {
    const got = normalizeCursorModelSelection([
      { id: "auto" },
      null,
      { id: 5 },
      { id: "auto" },
      { id: "composer-2.5", default: true },
    ]);
    expect(got).toEqual([
      { id: "auto", default: false },
      { id: "composer-2.5", default: true },
    ]);
  });

  it("guarantees exactly one default — first wins when several flagged", () => {
    const got = normalizeCursorModelSelection([
      { id: "a", default: true },
      { id: "b", default: true },
    ]);
    expect(got).toEqual([
      { id: "a", default: true },
      { id: "b", default: false },
    ]);
  });

  it("promotes the first when none is flagged", () => {
    const got = normalizeCursorModelSelection([{ id: "a" }, { id: "b" }]);
    expect(got[0].default).toBe(true);
    expect(got[1].default).toBe(false);
  });

  it("round-trips through serialize/parse", () => {
    const list = [
      { id: "auto", default: false },
      { id: "composer-2.5", default: true },
    ];
    expect(parseCursorModelSelection(serializeCursorModelSelection(list))).toEqual(
      list,
    );
  });
});

describe("selection transforms", () => {
  const base = [
    { id: "composer-2.5", default: true },
    { id: "auto", default: false },
  ];

  it("addCursorModel appends, ignores dups, defaults the first into an empty list", () => {
    expect(addCursorModel(base, "gpt-5.3-codex-high")).toEqual([
      ...base,
      { id: "gpt-5.3-codex-high", default: false },
    ]);
    expect(addCursorModel(base, "auto")).toBe(base);
    expect(addCursorModel([], "auto")).toEqual([{ id: "auto", default: true }]);
  });

  it("removeCursorModel drops the id and re-promotes a default when needed", () => {
    expect(removeCursorModel(base, "auto")).toEqual([
      { id: "composer-2.5", default: true },
    ]);
    expect(removeCursorModel(base, "composer-2.5")).toEqual([
      { id: "auto", default: true },
    ]);
    expect(removeCursorModel(base, "missing")).toEqual(base);
    expect(removeCursorModel([{ id: "auto", default: true }], "auto")).toEqual([]);
  });

  it("moveCursorModel swaps neighbors and no-ops past the ends", () => {
    expect(moveCursorModel(base, 0, 1)).toEqual([
      { id: "auto", default: false },
      { id: "composer-2.5", default: true },
    ]);
    expect(moveCursorModel(base, 0, -1)).toBe(base);
    expect(moveCursorModel(base, 1, 1)).toBe(base);
  });

  it("setDefaultCursorModel moves the flag and ignores unknown ids", () => {
    expect(setDefaultCursorModel(base, "auto")).toEqual([
      { id: "composer-2.5", default: false },
      { id: "auto", default: true },
    ]);
    expect(setDefaultCursorModel(base, "missing")).toBe(base);
  });

  it("defaultCursorModel returns the flagged id, else first, else fallback", () => {
    expect(defaultCursorModel(base)).toBe("composer-2.5");
    expect(defaultCursorModel([{ id: "auto", default: false }])).toBe("auto");
    expect(defaultCursorModel([])).toBe(FALLBACK_CURSOR_MODEL);
  });
});

describe("isKnownCursorModel (UI staleness flag for removed models)", () => {
  it("reflects catalog membership — no auto-substitution, just a UI cue", () => {
    expect(isKnownCursorModel("auto", CATALOG)).toBe(true);
    expect(isKnownCursorModel("composer-3", CATALOG)).toBe(false);
  });

  it("a configured-but-removed model survives in the selection (no crash)", () => {
    // composer-2.5 got EOL'd: it's gone from the catalog but stays selected,
    // still resolvable to a label (its id) so nothing throws. The user removes
    // it in Settings; launching it surfaces cursor's own clear runtime error.
    const stale = normalizeCursorModelSelection([
      { id: "composer-2.5", default: true },
    ]);
    expect(defaultCursorModel(stale)).toBe("composer-2.5");
    expect(cursorModelLabel("composer-2.5", CATALOG)).toBe("Composer 2.5");
    expect(cursorModelLabel("composer-2.5", [])).toBe("composer-2.5");
  });
});

describe("display joins", () => {
  it("cursorModelLabel looks up the label, falling back to the id", () => {
    expect(cursorModelLabel("auto", CATALOG)).toBe("Auto");
    expect(cursorModelLabel("ghost", CATALOG)).toBe("ghost");
  });

  it("cursorModelOptions maps the selection to {id,label} in order", () => {
    const list = [
      { id: "auto", default: true },
      { id: "ghost", default: false },
    ];
    expect(cursorModelOptions(list, CATALOG)).toEqual([
      { id: "auto", label: "Auto" },
      { id: "ghost", label: "ghost" },
    ]);
  });

  it("availableCursorModelsToAdd returns catalog entries not yet selected", () => {
    const list = [{ id: "auto", default: true }];
    expect(availableCursorModelsToAdd(list, CATALOG)).toEqual([
      { id: "composer-2.5", label: "Composer 2.5" },
      { id: "gpt-5.3-codex-high", label: "Codex 5.3 High" },
    ]);
  });
});

describe("resolveCursorModel", () => {
  it("prefers the chosen model, then the default, then the fallback", () => {
    expect(resolveCursorModel({ model: "auto" })).toBe("auto");
    expect(resolveCursorModel({ model: "  composer-2.5 " })).toBe("composer-2.5");
    expect(resolveCursorModel({ model: "", defaultModel: "auto" })).toBe("auto");
    expect(resolveCursorModel({ model: null, defaultModel: "  " })).toBe(
      FALLBACK_CURSOR_MODEL,
    );
  });
});
