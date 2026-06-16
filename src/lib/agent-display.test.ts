import { describe, expect, it } from "vitest";
import type { SessionStatus } from "../db/schema";
import type { SessionStatusCounts } from "./board-order";
import {
  AWAITING_INPUT_VISUAL,
  RUNNING_BUSY_VISUAL,
  SESSION_STATUS_VISUAL,
  sessionBadges,
  sessionVisual,
} from "./agent-display";

const ALL_STATUSES: SessionStatus[] = ["running", "finished", "error", "killed"];

function counts(overrides: Partial<SessionStatusCounts>): SessionStatusCounts {
  return {
    running: 0,
    busy: 0,
    awaiting: 0,
    finished: 0,
    error: 0,
    killed: 0,
    ...overrides,
  };
}

describe("SESSION_STATUS_VISUAL", () => {
  it("uses a plain colored dot for every process status (no spinner)", () => {
    // The spinner is reserved for the hook-confirmed "busy" overlay, not the
    // bare process status — a running session with no hook signal is unknown.
    for (const status of ALL_STATUSES) {
      expect(SESSION_STATUS_VISUAL[status].indicator).toBe("badge");
    }
  });

  it("keeps the classic running=ok(green) / error=danger(red) fallback colors", () => {
    // Re-tokenized for the dark theme but semantically unchanged: running stays
    // the "ok" (green) dot, error stays the "danger" (red) dot.
    expect(SESSION_STATUS_VISUAL.running.dot).toMatch(/bg-ok/);
    expect(SESSION_STATUS_VISUAL.error.dot).toMatch(/bg-danger/);
  });

  it("gives every status a label, dot color, and pill", () => {
    for (const status of ALL_STATUSES) {
      const v = SESSION_STATUS_VISUAL[status];
      expect(v.label.length).toBeGreaterThan(0);
      expect(v.dot).toMatch(/bg-/);
      expect(v.pill.length).toBeGreaterThan(0);
    }
  });

  it("only flags the awaiting overlay as needing the user's attention", () => {
    expect(AWAITING_INPUT_VISUAL.needsAttention).toBe(true);
    expect(RUNNING_BUSY_VISUAL.needsAttention).toBe(false);
    for (const status of ALL_STATUSES) {
      expect(SESSION_STATUS_VISUAL[status].needsAttention).toBe(false);
    }
  });
});

describe("sessionVisual", () => {
  it("maps a running session by its hook activity", () => {
    expect(sessionVisual("running", "busy")).toBe(RUNNING_BUSY_VISUAL);
    expect(RUNNING_BUSY_VISUAL.indicator).toBe("spinner");
    expect(sessionVisual("running", "awaiting")).toBe(AWAITING_INPUT_VISUAL);
  });

  it("falls back to the plain green running dot when no hook has reported", () => {
    expect(sessionVisual("running", null)).toBe(SESSION_STATUS_VISUAL.running);
    expect(sessionVisual("running")).toBe(SESSION_STATUS_VISUAL.running);
  });

  it("ignores activity for ended statuses", () => {
    expect(sessionVisual("finished", "busy")).toBe(SESSION_STATUS_VISUAL.finished);
    expect(sessionVisual("error", "awaiting")).toBe(SESSION_STATUS_VISUAL.error);
  });
});

describe("sessionBadges", () => {
  it("drops empty buckets", () => {
    expect(sessionBadges(counts({}))).toEqual([]);
  });

  it("splits running into busy (spinner), awaiting (your turn), and unknown (green)", () => {
    const badges = sessionBadges(counts({ running: 5, busy: 2, awaiting: 1 }));
    expect(badges).toEqual([
      {
        key: "busy",
        status: "running",
        activity: "busy",
        count: 2,
        visual: RUNNING_BUSY_VISUAL,
      },
      {
        key: "awaiting",
        status: "running",
        activity: "awaiting",
        count: 1,
        visual: AWAITING_INPUT_VISUAL,
      },
      {
        key: "running",
        status: "running",
        activity: null,
        count: 2, // 5 running - 2 busy - 1 awaiting
        visual: SESSION_STATUS_VISUAL.running,
      },
    ]);
  });

  it("shows a plain green running badge when no hook has reported", () => {
    const badges = sessionBadges(counts({ running: 3 }));
    expect(badges.map((b) => b.key)).toEqual(["running"]);
    expect(badges[0]).toMatchObject({ activity: null, count: 3 });
  });

  it("orders live work first, awaiting next, then unknown and history", () => {
    const badges = sessionBadges(
      counts({
        running: 3,
        busy: 1,
        awaiting: 1,
        finished: 2,
        error: 3,
        killed: 4,
      }),
    );
    expect(badges.map((b) => b.key)).toEqual([
      "busy",
      "awaiting",
      "running",
      "finished",
      "error",
      "killed",
    ]);
    expect(badges.map((b) => b.count)).toEqual([1, 1, 1, 2, 3, 4]);
  });
});
