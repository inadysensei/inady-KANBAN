import { describe, expect, test } from "vitest";
import { formatDuration, promptFirstLine } from "./session-display";

describe("promptFirstLine", () => {
  test("returns a single-line prompt trimmed", () => {
    expect(promptFirstLine("  fix the login bug  ")).toBe("fix the login bug");
  });

  test("returns only the first line of a multiline prompt", () => {
    expect(promptFirstLine("add dark mode\nuse Tailwind\nkeep it simple")).toBe(
      "add dark mode",
    );
  });

  test("skips leading empty/whitespace-only lines", () => {
    expect(promptFirstLine("\n   \n  refactor the parser\nmore")).toBe(
      "refactor the parser",
    );
  });

  test("returns empty string for empty or whitespace-only prompts", () => {
    expect(promptFirstLine("")).toBe("");
    expect(promptFirstLine("   \n  \n\t")).toBe("");
  });

  test("handles CRLF line endings", () => {
    expect(promptFirstLine("first line\r\nsecond line")).toBe("first line");
  });
});

describe("formatDuration", () => {
  test("formats sub-minute durations as seconds", () => {
    expect(formatDuration(0, 42_000)).toBe("42s");
    expect(formatDuration(0, 59_999)).toBe("59s");
  });

  test("formats zero and sub-second durations as 0s", () => {
    expect(formatDuration(1000, 1000)).toBe("0s");
    expect(formatDuration(0, 999)).toBe("0s");
  });

  test("clamps negative durations to 0s", () => {
    expect(formatDuration(5000, 1000)).toBe("0s");
  });

  test("formats minutes with remaining seconds", () => {
    expect(formatDuration(0, 60_000)).toBe("1m 0s");
    expect(formatDuration(0, 192_000)).toBe("3m 12s");
    expect(formatDuration(0, 59 * 60_000 + 59_000)).toBe("59m 59s");
  });

  test("formats hours with zero-padded minutes, dropping seconds", () => {
    expect(formatDuration(0, 3_900_000)).toBe("1h 05m");
    expect(formatDuration(0, 2 * 3_600_000)).toBe("2h 00m");
    expect(formatDuration(0, 3_600_000 + 59 * 60_000 + 59_000)).toBe("1h 59m");
  });
});
