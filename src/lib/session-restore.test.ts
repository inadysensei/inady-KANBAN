import { describe, expect, test } from "vitest";
import { lastSessionStorageKey, pickInitialSession } from "./session-restore";

describe("pickInitialSession", () => {
  // The page provides ids most-recent first (orderBy startedAt desc).
  const ids = ["s3", "s2", "s1"];

  test("a URL deep-link wins and opens fresh (resume:false)", () => {
    expect(
      pickInitialSession({
        urlSessionId: "s2",
        storedSessionId: "s1",
        sessionIds: ids,
      }),
    ).toEqual({ sessionDbId: "s2", resume: false });
  });

  test("falls back to the stored session, re-opened (resume:true)", () => {
    expect(
      pickInitialSession({
        urlSessionId: null,
        storedSessionId: "s1",
        sessionIds: ids,
      }),
    ).toEqual({ sessionDbId: "s1", resume: true });
  });

  test("opens the most-recent session when nothing is stored", () => {
    expect(
      pickInitialSession({
        urlSessionId: null,
        storedSessionId: null,
        sessionIds: ids,
      }),
    ).toEqual({ sessionDbId: "s3", resume: true });
  });

  test("ignores a stale stored id and falls back to most-recent", () => {
    expect(
      pickInitialSession({
        urlSessionId: null,
        storedSessionId: "gone",
        sessionIds: ids,
      }),
    ).toEqual({ sessionDbId: "s3", resume: true });
  });

  test("ignores a stale URL id and falls back to the stored session", () => {
    expect(
      pickInitialSession({
        urlSessionId: "gone",
        storedSessionId: "s2",
        sessionIds: ids,
      }),
    ).toEqual({ sessionDbId: "s2", resume: true });
  });

  test("returns null when the ticket has no sessions", () => {
    expect(
      pickInitialSession({
        urlSessionId: "x",
        storedSessionId: "y",
        sessionIds: [],
      }),
    ).toBeNull();
  });
});

describe("lastSessionStorageKey", () => {
  test("namespaces by ticket id", () => {
    expect(lastSessionStorageKey("t1")).toBe("inady-kanban:last-session:t1");
  });
});
