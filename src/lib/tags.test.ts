import { describe, expect, it } from "vitest";
import {
  DEFAULT_TAGS,
  groupTagsByTicket,
  isValidTagColor,
  normalizeTagColor,
  normalizeTagName,
  resolveTagIds,
  ticketMatchesTags,
} from "./tags";

describe("normalizeTagColor", () => {
  it("keeps a lowercase 6-digit hex as-is", () => {
    expect(normalizeTagColor("#ef4444")).toBe("#ef4444");
  });

  it("lowercases uppercase hex", () => {
    expect(normalizeTagColor("#EF4444")).toBe("#ef4444");
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeTagColor("  #abcdef  ")).toBe("#abcdef");
  });

  it("expands #rgb shorthand to #rrggbb", () => {
    expect(normalizeTagColor("#0af")).toBe("#00aaff");
  });

  it("rejects a color without a leading #", () => {
    expect(() => normalizeTagColor("ef4444")).toThrow();
  });

  it("rejects a non-hex value", () => {
    expect(() => normalizeTagColor("#gggggg")).toThrow();
  });

  it("rejects a wrong-length value", () => {
    expect(() => normalizeTagColor("#ef44")).toThrow();
  });

  it("rejects an empty value", () => {
    expect(() => normalizeTagColor("")).toThrow();
  });
});

describe("isValidTagColor", () => {
  it("accepts a 6-digit hex", () => {
    expect(isValidTagColor("#ef4444")).toBe(true);
  });

  it("accepts a 3-digit hex", () => {
    expect(isValidTagColor("#0af")).toBe(true);
  });

  it("rejects a missing #", () => {
    expect(isValidTagColor("ef4444")).toBe(false);
  });

  it("rejects garbage", () => {
    expect(isValidTagColor("not-a-color")).toBe(false);
  });
});

describe("normalizeTagName", () => {
  it("trims surrounding whitespace", () => {
    expect(normalizeTagName("  High  ")).toBe("High");
  });

  it("throws on an empty / whitespace-only name", () => {
    expect(() => normalizeTagName("   ")).toThrow();
  });
});

describe("resolveTagIds", () => {
  const existing = ["a", "b", "c"];

  it("keeps only ids that exist, in requested order", () => {
    expect(resolveTagIds(["c", "a"], existing)).toEqual(["c", "a"]);
  });

  it("drops ids that do not match an existing tag", () => {
    // The note in the ticket: an unmatched tag id is skipped, not an error.
    expect(resolveTagIds(["a", "zzz", "b"], existing)).toEqual(["a", "b"]);
  });

  it("de-duplicates repeated ids (first wins)", () => {
    expect(resolveTagIds(["a", "a", "b"], existing)).toEqual(["a", "b"]);
  });

  it("returns an empty array when nothing matches", () => {
    expect(resolveTagIds(["x", "y"], existing)).toEqual([]);
  });

  it("accepts a Set of existing ids", () => {
    expect(resolveTagIds(["b", "x"], new Set(existing))).toEqual(["b"]);
  });
});

describe("groupTagsByTicket", () => {
  const rows = [
    { ticketId: "t1", id: "a", name: "High", color: "#ef4444" },
    { ticketId: "t1", id: "b", name: "Low", color: "#22c55e" },
    { ticketId: "t2", id: "a", name: "High", color: "#ef4444" },
  ];

  it("folds join rows into per-ticket chip lists, preserving input order", () => {
    expect(groupTagsByTicket(rows)).toEqual({
      t1: [
        { id: "a", name: "High", color: "#ef4444" },
        { id: "b", name: "Low", color: "#22c55e" },
      ],
      t2: [{ id: "a", name: "High", color: "#ef4444" }],
    });
  });

  it("drops the ticketId from each chip (board cards only need id/name/color)", () => {
    const [chip] = groupTagsByTicket(rows).t1;
    expect(chip).not.toHaveProperty("ticketId");
  });

  it("returns an empty record for no rows", () => {
    expect(groupTagsByTicket([])).toEqual({});
  });
});

describe("ticketMatchesTags", () => {
  it("matches every ticket when no tags are active (filter off)", () => {
    expect(ticketMatchesTags([], [])).toBe(true);
    expect(ticketMatchesTags(["a", "b"], [])).toBe(true);
  });

  it("matches when the ticket carries any active tag (OR semantics)", () => {
    // OR — not AND — because the seeded tags (High/Mid/Low) are mutually
    // exclusive priorities; AND would make multi-select a dead end (a ticket is
    // never both High and Mid), so adding tags broadens rather than empties.
    expect(ticketMatchesTags(["high"], ["high", "mid"])).toBe(true);
    expect(ticketMatchesTags(["mid"], ["high", "mid"])).toBe(true);
  });

  it("does not match when the ticket shares none of the active tags", () => {
    expect(ticketMatchesTags(["low"], ["high", "mid"])).toBe(false);
    expect(ticketMatchesTags([], ["high"])).toBe(false);
  });
});

describe("DEFAULT_TAGS", () => {
  it("seeds the three priority tags with valid hex colors", () => {
    expect(DEFAULT_TAGS.map((t) => t.name)).toEqual(["High", "Mid", "Low"]);
    for (const tag of DEFAULT_TAGS) {
      expect(isValidTagColor(tag.color)).toBe(true);
      // Stored colors are already normalized 6-digit hex.
      expect(normalizeTagColor(tag.color)).toBe(tag.color);
    }
  });
});
