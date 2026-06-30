import { describe, expect, it } from "vitest";
import { parseClineHistory, pickClineSession } from "./cline-agent";

describe("parseClineHistory", () => {
  it("parses an array of entries, dropping ones without a string sessionId", () => {
    const stdout = JSON.stringify([
      { sessionId: "a", cwd: "/repo", interactive: true },
      { cwd: "/repo" }, // no sessionId
      { sessionId: 5 }, // non-string id
      null,
    ]);
    expect(parseClineHistory(stdout)).toEqual([
      { sessionId: "a", cwd: "/repo", interactive: true },
    ]);
  });

  it("returns [] for malformed JSON or a non-array payload", () => {
    expect(parseClineHistory("not json")).toEqual([]);
    expect(parseClineHistory("{}")).toEqual([]);
    expect(parseClineHistory("")).toEqual([]);
  });
});

describe("pickClineSession", () => {
  const PROMPT = "Title\n\nImplement the thing";

  it("matches the interactive session with the exact prompt", () => {
    const id = pickClineSession(
      [
        { sessionId: "old", cwd: "/repo", interactive: true, prompt: "other" },
        { sessionId: "mine", cwd: "/repo", interactive: true, prompt: PROMPT },
      ],
      { cwd: "/repo", prompt: PROMPT },
    );
    expect(id).toBe("mine");
  });

  it("returns null when no prompt matches", () => {
    expect(
      pickClineSession(
        [{ sessionId: "x", cwd: "/repo", interactive: true, prompt: "nope" }],
        { cwd: "/repo", prompt: PROMPT },
      ),
    ).toBeNull();
  });

  it("ignores headless (interactive===false) sessions", () => {
    expect(
      pickClineSession(
        [{ sessionId: "h", cwd: "/repo", interactive: false, prompt: PROMPT }],
        { cwd: "/repo", prompt: PROMPT },
      ),
    ).toBeNull();
  });

  it("on a same-prompt re-run, prefers the same cwd then the newest start", () => {
    const id = pickClineSession(
      [
        {
          sessionId: "elsewhere",
          cwd: "/other",
          interactive: true,
          prompt: PROMPT,
          startedAt: "2026-06-30T10:00:00Z",
        },
        {
          sessionId: "older",
          cwd: "/repo",
          interactive: true,
          prompt: PROMPT,
          startedAt: "2026-06-30T09:00:00Z",
        },
        {
          sessionId: "newest",
          cwd: "/repo",
          interactive: true,
          prompt: PROMPT,
          startedAt: "2026-06-30T11:00:00Z",
        },
      ],
      { cwd: "/repo", prompt: PROMPT },
    );
    expect(id).toBe("newest");
  });

  it("matches a --worktree session by prompt even when cwd differs", () => {
    const id = pickClineSession(
      [
        {
          sessionId: "wt",
          cwd: "/Users/me/.cline/worktrees/abc",
          workspaceRoot: "/Users/me/.cline/worktrees/abc",
          interactive: true,
          prompt: PROMPT,
        },
      ],
      { cwd: "/repo", prompt: PROMPT },
    );
    expect(id).toBe("wt");
  });
});
