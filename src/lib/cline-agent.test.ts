import { describe, expect, it } from "vitest";
import {
  parseClineHistory,
  pickClineSession,
  stripUserInputWrapper,
} from "./cline-agent";

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

describe("stripUserInputWrapper", () => {
  it("strips a <user_input mode='act'> wrapper, preserving the inner text", () => {
    expect(
      stripUserInputWrapper('<user_input mode="act">do the thing</user_input>'),
    ).toBe("do the thing");
  });

  it("preserves newlines inside the wrapper", () => {
    const inner = "line 1\nline 2\nline 3";
    expect(
      stripUserInputWrapper(
        `<user_input mode="act">${inner}</user_input>`,
      ),
    ).toBe(inner);
  });

  it("returns the prompt verbatim when there is no wrapper", () => {
    expect(stripUserInputWrapper("just a prompt")).toBe("just a prompt");
    expect(stripUserInputWrapper("")).toBe("");
  });

  it("handles attributes other than mode", () => {
    expect(
      stripUserInputWrapper(
        '<user_input mode="ask" foo="bar">hello</user_input>',
      ),
    ).toBe("hello");
  });

  it("does not strip a partial wrapper (no closing tag)", () => {
    expect(
      stripUserInputWrapper('<user_input mode="act">no closing tag'),
    ).toBe('<user_input mode="act">no closing tag');
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

  it("matches a session whose stored prompt is wrapped in <user_input>", () => {
    // cline wraps every interactive prompt in <user_input mode="act">…</user_input>
    // when persisting it. pickClineSession must strip that wrapper before
    // comparing, otherwise the match always fails and the placeholder UUID is
    // never replaced — causing "Unknown session" errors on resume.
    const id = pickClineSession(
      [
        {
          sessionId: "wrapped",
          cwd: "/repo",
          interactive: true,
          prompt: `<user_input mode="act">${PROMPT}</user_input>`,
        },
      ],
      { cwd: "/repo", prompt: PROMPT },
    );
    expect(id).toBe("wrapped");
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
