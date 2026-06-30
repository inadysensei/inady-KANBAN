import { describe, expect, it } from "vitest";
import {
  CLINE_MODEL_CATALOG,
  DEFAULT_CLINE_MODELS,
  FALLBACK_CLINE_MODEL,
  addClineModel,
  availableClineModelsToAdd,
  clineModelLabel,
  clineModelOptions,
  defaultClineModel,
  isKnownClineModel,
  moveClineModel,
  normalizeClineModelSelection,
  parseClineModelSelection,
  removeClineModel,
  resolveClineModel,
  serializeClineModelSelection,
  setDefaultClineModel,
  type ClineModelCatalogEntry,
} from "./cline-models";

const CATALOG: ClineModelCatalogEntry[] = [
  { id: "cline-pass/glm-5.2", label: "GLM-5.2" },
  { id: "cline-pass/kimi-k2.6", label: "Kimi K2.6" },
  { id: "cline-pass/minimax-m3", label: "MiniMax M3" },
];

describe("catalog", () => {
  it("is non-empty, all ids carry the cline-pass/ prefix, and includes the default", () => {
    const ids = new Set(CLINE_MODEL_CATALOG.map((m) => m.id));
    expect(CLINE_MODEL_CATALOG.length).toBeGreaterThan(0);
    expect(ids.has(FALLBACK_CLINE_MODEL)).toBe(true);
    expect(CLINE_MODEL_CATALOG.every((m) => m.id.startsWith("cline-pass/"))).toBe(
      true,
    );
  });

  it("the default selection points at the fallback model (single source of truth)", () => {
    expect(DEFAULT_CLINE_MODELS).toEqual([
      { id: FALLBACK_CLINE_MODEL, default: true },
    ]);
  });
});

describe("normalizeClineModelSelection / parseClineModelSelection", () => {
  it("falls back to the default selection on empty/malformed input", () => {
    expect(parseClineModelSelection(null)).toEqual(DEFAULT_CLINE_MODELS);
    expect(parseClineModelSelection("not json")).toEqual(DEFAULT_CLINE_MODELS);
    expect(parseClineModelSelection("{}")).toEqual(DEFAULT_CLINE_MODELS);
    expect(normalizeClineModelSelection([])).toEqual(DEFAULT_CLINE_MODELS);
    // the returned default is a copy, not the shared constant
    expect(parseClineModelSelection(null)).not.toBe(DEFAULT_CLINE_MODELS);
  });

  it("keeps order, drops bad entries and dup ids, coerces default", () => {
    const got = normalizeClineModelSelection([
      { id: "cline-pass/kimi-k2.6" },
      null,
      { id: 5 },
      { id: "cline-pass/kimi-k2.6" },
      { id: "cline-pass/glm-5.2", default: true },
    ]);
    expect(got).toEqual([
      { id: "cline-pass/kimi-k2.6", default: false },
      { id: "cline-pass/glm-5.2", default: true },
    ]);
  });

  it("guarantees exactly one default — first wins when several flagged", () => {
    const got = normalizeClineModelSelection([
      { id: "a", default: true },
      { id: "b", default: true },
    ]);
    expect(got).toEqual([
      { id: "a", default: true },
      { id: "b", default: false },
    ]);
  });

  it("promotes the first when none is flagged", () => {
    const got = normalizeClineModelSelection([{ id: "a" }, { id: "b" }]);
    expect(got[0].default).toBe(true);
    expect(got[1].default).toBe(false);
  });

  it("round-trips through serialize/parse", () => {
    const list = [
      { id: "cline-pass/kimi-k2.6", default: false },
      { id: "cline-pass/glm-5.2", default: true },
    ];
    expect(parseClineModelSelection(serializeClineModelSelection(list))).toEqual(
      list,
    );
  });
});

describe("selection transforms", () => {
  const base = [
    { id: "cline-pass/glm-5.2", default: true },
    { id: "cline-pass/kimi-k2.6", default: false },
  ];

  it("addClineModel appends, ignores dups, defaults the first into an empty list", () => {
    expect(addClineModel(base, "cline-pass/minimax-m3")).toEqual([
      ...base,
      { id: "cline-pass/minimax-m3", default: false },
    ]);
    expect(addClineModel(base, "cline-pass/kimi-k2.6")).toBe(base);
    expect(addClineModel([], "cline-pass/kimi-k2.6")).toEqual([
      { id: "cline-pass/kimi-k2.6", default: true },
    ]);
  });

  it("removeClineModel drops the id and re-promotes a default when needed", () => {
    expect(removeClineModel(base, "cline-pass/kimi-k2.6")).toEqual([
      { id: "cline-pass/glm-5.2", default: true },
    ]);
    expect(removeClineModel(base, "cline-pass/glm-5.2")).toEqual([
      { id: "cline-pass/kimi-k2.6", default: true },
    ]);
    expect(removeClineModel(base, "missing")).toEqual(base);
    expect(
      removeClineModel([{ id: "cline-pass/glm-5.2", default: true }], "cline-pass/glm-5.2"),
    ).toEqual([]);
  });

  it("moveClineModel swaps neighbors and no-ops past the ends", () => {
    expect(moveClineModel(base, 0, 1)).toEqual([
      { id: "cline-pass/kimi-k2.6", default: false },
      { id: "cline-pass/glm-5.2", default: true },
    ]);
    expect(moveClineModel(base, 0, -1)).toBe(base);
    expect(moveClineModel(base, 1, 1)).toBe(base);
  });

  it("setDefaultClineModel moves the flag and ignores unknown ids", () => {
    expect(setDefaultClineModel(base, "cline-pass/kimi-k2.6")).toEqual([
      { id: "cline-pass/glm-5.2", default: false },
      { id: "cline-pass/kimi-k2.6", default: true },
    ]);
    expect(setDefaultClineModel(base, "missing")).toBe(base);
  });

  it("defaultClineModel returns the flagged id, else first, else fallback", () => {
    expect(defaultClineModel(base)).toBe("cline-pass/glm-5.2");
    expect(defaultClineModel([{ id: "cline-pass/kimi-k2.6", default: false }])).toBe(
      "cline-pass/kimi-k2.6",
    );
    expect(defaultClineModel([])).toBe(FALLBACK_CLINE_MODEL);
  });
});

describe("isKnownClineModel (UI staleness flag for removed models)", () => {
  it("reflects catalog membership — no auto-substitution, just a UI cue", () => {
    expect(isKnownClineModel("cline-pass/glm-5.2", CATALOG)).toBe(true);
    expect(isKnownClineModel("cline-pass/ghost", CATALOG)).toBe(false);
  });

  it("a configured-but-removed model survives in the selection (no crash)", () => {
    const stale = normalizeClineModelSelection([
      { id: "cline-pass/retired", default: true },
    ]);
    expect(defaultClineModel(stale)).toBe("cline-pass/retired");
    expect(clineModelLabel("cline-pass/retired", CATALOG)).toBe("cline-pass/retired");
  });
});

describe("display joins", () => {
  it("clineModelLabel looks up the label, falling back to the id", () => {
    expect(clineModelLabel("cline-pass/glm-5.2", CATALOG)).toBe("GLM-5.2");
    expect(clineModelLabel("cline-pass/ghost", CATALOG)).toBe("cline-pass/ghost");
  });

  it("clineModelOptions maps the selection to {id,label} in order", () => {
    const list = [
      { id: "cline-pass/glm-5.2", default: true },
      { id: "cline-pass/ghost", default: false },
    ];
    expect(clineModelOptions(list, CATALOG)).toEqual([
      { id: "cline-pass/glm-5.2", label: "GLM-5.2" },
      { id: "cline-pass/ghost", label: "cline-pass/ghost" },
    ]);
  });

  it("availableClineModelsToAdd returns catalog entries not yet selected", () => {
    const list = [{ id: "cline-pass/glm-5.2", default: true }];
    expect(availableClineModelsToAdd(list, CATALOG)).toEqual([
      { id: "cline-pass/kimi-k2.6", label: "Kimi K2.6" },
      { id: "cline-pass/minimax-m3", label: "MiniMax M3" },
    ]);
  });
});

describe("resolveClineModel", () => {
  it("prefers the chosen model, then the default, then the fallback", () => {
    expect(resolveClineModel({ model: "cline-pass/kimi-k2.6" })).toBe(
      "cline-pass/kimi-k2.6",
    );
    expect(resolveClineModel({ model: "  cline-pass/glm-5.2 " })).toBe(
      "cline-pass/glm-5.2",
    );
    expect(
      resolveClineModel({ model: "", defaultModel: "cline-pass/minimax-m3" }),
    ).toBe("cline-pass/minimax-m3");
    expect(resolveClineModel({ model: null, defaultModel: "  " })).toBe(
      FALLBACK_CLINE_MODEL,
    );
  });
});
