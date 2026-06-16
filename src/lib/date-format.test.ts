import { describe, expect, it } from "vitest";
import {
  DATE_FORMATS,
  dateInputToTimestamp,
  daysUntil,
  deadlineLabel,
  DEFAULT_DATE_FORMAT,
  formatDate,
  parseDateFormat,
  timestampToDateInput,
} from "./date-format";

describe("DATE_FORMATS / DEFAULT_DATE_FORMAT", () => {
  it("defaults to YYYY/MM/DD and includes it as an option", () => {
    expect(DEFAULT_DATE_FORMAT).toBe("YYYY/MM/DD");
    expect(DATE_FORMATS).toContain("YYYY/MM/DD");
  });
});

describe("parseDateFormat", () => {
  it("returns a known format unchanged", () => {
    expect(parseDateFormat("DD.MM.YYYY")).toBe("DD.MM.YYYY");
    expect(parseDateFormat("YYYY-MM-DD")).toBe("YYYY-MM-DD");
  });

  it("falls back to the default for unknown or empty input", () => {
    expect(parseDateFormat("nonsense")).toBe(DEFAULT_DATE_FORMAT);
    expect(parseDateFormat("")).toBe(DEFAULT_DATE_FORMAT);
    expect(parseDateFormat("yyyy/mm/dd")).toBe(DEFAULT_DATE_FORMAT);
  });
});

describe("formatDate", () => {
  // Built via local-time Date so the round-trip is TZ-independent: formatDate
  // reads the same local components these constructors set.
  const singleDigit = new Date(2026, 5, 9).getTime(); // 2026-06-09 (June)
  const doubleDigit = new Date(2025, 11, 25).getTime(); // 2025-12-25

  it("zero-pads month and day across every format", () => {
    expect(formatDate(singleDigit, "YYYY/MM/DD")).toBe("2026/06/09");
    expect(formatDate(singleDigit, "YYYY-MM-DD")).toBe("2026-06-09");
    expect(formatDate(singleDigit, "MM/DD/YYYY")).toBe("06/09/2026");
    expect(formatDate(singleDigit, "DD/MM/YYYY")).toBe("09/06/2026");
    expect(formatDate(singleDigit, "DD.MM.YYYY")).toBe("09.06.2026");
  });

  it("renders two-digit month and day without extra padding", () => {
    expect(formatDate(doubleDigit, "YYYY/MM/DD")).toBe("2025/12/25");
    expect(formatDate(doubleDigit, "MM/DD/YYYY")).toBe("12/25/2025");
  });
});

describe("dateInputToTimestamp", () => {
  it("parses a YYYY-MM-DD value to that local-midnight epoch", () => {
    // Parsed via date parts (not UTC), so it matches local-time rendering.
    expect(dateInputToTimestamp("2026-06-20")).toBe(
      new Date(2026, 5, 20).getTime(),
    );
    expect(dateInputToTimestamp("2026-01-05")).toBe(
      new Date(2026, 0, 5).getTime(),
    );
  });

  it("returns null for an empty or malformed value", () => {
    expect(dateInputToTimestamp("")).toBeNull();
    expect(dateInputToTimestamp("   ")).toBeNull();
    expect(dateInputToTimestamp("2026/06/20")).toBeNull();
    expect(dateInputToTimestamp("not-a-date")).toBeNull();
  });
});

describe("timestampToDateInput", () => {
  it("renders an epoch as the YYYY-MM-DD an <input type=date> expects", () => {
    expect(timestampToDateInput(new Date(2026, 5, 9).getTime())).toBe(
      "2026-06-09",
    );
    expect(timestampToDateInput(new Date(2025, 11, 25).getTime())).toBe(
      "2025-12-25",
    );
  });

  it("round-trips with dateInputToTimestamp", () => {
    const ts = new Date(2026, 2, 1).getTime();
    expect(dateInputToTimestamp(timestampToDateInput(ts))).toBe(ts);
  });
});

describe("daysUntil", () => {
  // Both arguments are reduced to local midnight, so partial days don't count.
  const today = new Date(2026, 5, 16).getTime();

  it("counts whole calendar days, ignoring the time of day", () => {
    const lateToday = new Date(2026, 5, 16, 23, 59).getTime();
    expect(daysUntil(new Date(2026, 5, 20).getTime(), lateToday)).toBe(4);
    expect(daysUntil(new Date(2026, 5, 17, 0, 1).getTime(), today)).toBe(1);
  });

  it("is 0 on the deadline day", () => {
    expect(daysUntil(new Date(2026, 5, 16, 8).getTime(), today)).toBe(0);
  });

  it("is negative once the deadline has passed", () => {
    expect(daysUntil(new Date(2026, 5, 13).getTime(), today)).toBe(-3);
  });
});

describe("deadlineLabel", () => {
  it("labels the deadline relative to today", () => {
    expect(deadlineLabel(0)).toBe("Due today");
    expect(deadlineLabel(1)).toBe("1 day left");
    expect(deadlineLabel(5)).toBe("5 days left");
    expect(deadlineLabel(-1)).toBe("1 day overdue");
    expect(deadlineLabel(-4)).toBe("4 days overdue");
  });
});
