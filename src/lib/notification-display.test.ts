import { describe, expect, test } from "vitest";
import type { SessionEvent } from "./board-events";
import {
  formatBadgeCount,
  nextUnreadCount,
  notificationBody,
  shouldNotify,
} from "./notification-display";

function event(partial: Partial<SessionEvent>): SessionEvent {
  return {
    kind: "session",
    sessionDbId: partial.sessionDbId ?? "s1",
    ticketId: partial.ticketId ?? "t1",
    ticketTitle: partial.ticketTitle ?? "Ticket",
    agent: partial.agent ?? "claude",
    status: partial.status ?? "running",
    exitCode: partial.exitCode ?? null,
    activity: partial.activity,
  };
}

describe("shouldNotify", () => {
  test("notifies on awaiting, finished, and error", () => {
    expect(shouldNotify(event({ activity: "awaiting" }))).toBe(true);
    expect(shouldNotify(event({ status: "finished" }))).toBe(true);
    expect(shouldNotify(event({ status: "error" }))).toBe(true);
  });

  test("does not notify on plain running or busy", () => {
    expect(shouldNotify(event({ status: "running" }))).toBe(false);
    expect(shouldNotify(event({ status: "running", activity: "busy" }))).toBe(
      false,
    );
    expect(shouldNotify(event({ status: "killed" }))).toBe(false);
  });
});

describe("notificationBody", () => {
  test("awaiting reads as 'needs your input'", () => {
    expect(notificationBody(event({ agent: "cursor", activity: "awaiting" }))).toBe(
      "Cursor needs your input",
    );
  });

  test("finished and error read distinctly, error includes exit code", () => {
    expect(notificationBody(event({ status: "finished" }))).toBe(
      "Claude agent finished",
    );
    expect(notificationBody(event({ status: "error", exitCode: 1 }))).toBe(
      "Claude agent failed (exit 1)",
    );
    expect(notificationBody(event({ status: "error", exitCode: null }))).toBe(
      "Claude agent failed",
    );
  });
});

describe("nextUnreadCount", () => {
  test("increments on a notify-worthy event while hidden", () => {
    expect(nextUnreadCount(2, event({ status: "finished" }), true)).toBe(3);
  });

  test("ignores events while the tab is focused", () => {
    expect(nextUnreadCount(2, event({ status: "finished" }), false)).toBe(2);
  });

  test("ignores non-notify events even while hidden", () => {
    expect(nextUnreadCount(2, event({ status: "running" }), true)).toBe(2);
    expect(
      nextUnreadCount(2, event({ status: "running", activity: "busy" }), true),
    ).toBe(2);
  });
});

describe("formatBadgeCount", () => {
  test("caps at 9+", () => {
    expect(formatBadgeCount(1)).toBe("1");
    expect(formatBadgeCount(9)).toBe("9");
    expect(formatBadgeCount(10)).toBe("9+");
  });
});
