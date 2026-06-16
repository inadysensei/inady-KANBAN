import { describe, expect, test } from "vitest";
import { AGENT_CLIS } from "./agent-cli";

const ID = "11111111-2222-3333-4444-555555555555";

describe("cursor CLI", () => {
  const cursor = AGENT_CLIS.cursor;

  test("initial launch passes the prompt positionally to the resumed chat", () => {
    expect(
      cursor.buildArgs({ sessionId: ID, wrappedPrompt: "do x", resume: false }),
    ).toEqual(["--resume", ID, "do x"]);
  });

  test("resume re-opens the chat without a prompt", () => {
    expect(
      cursor.buildArgs({ sessionId: ID, wrappedPrompt: "ignored", resume: true }),
    ).toEqual(["--resume", ID]);
  });

  test("auto-accepts the workspace trust prompt with 'a'", () => {
    expect(cursor.trustPromptRe.test("▶ [a] Trust this workspace")).toBe(true);
    expect(cursor.trustPromptRe.test("regular output")).toBe(false);
    expect(cursor.trustAnswer).toBe("a");
  });

  test("filters known cursor stderr noise from the stream", () => {
    expect(cursor.filterOutput("Retry attempt 3\nreal output\n")).toBe(
      "real output\n",
    );
  });
});

describe("claude CLI", () => {
  const claude = AGENT_CLIS.claude;

  test("initial launch pins the pre-issued UUID via --session-id", () => {
    expect(
      claude.buildArgs({ sessionId: ID, wrappedPrompt: "do x", resume: false }),
    ).toEqual(["--session-id", ID, "do x"]);
  });

  test("initial launch passes claude model and effort flags", () => {
    expect(
      claude.buildArgs({
        sessionId: ID,
        wrappedPrompt: "do x",
        resume: false,
        claudeModel: "sonnet",
        claudeEffort: "high",
      }),
    ).toEqual(["--session-id", ID, "--model", "sonnet", "--effort", "high", "do x"]);
  });

  test("resume re-opens the conversation by id", () => {
    expect(
      claude.buildArgs({ sessionId: ID, wrappedPrompt: "ignored", resume: true }),
    ).toEqual(["--resume", ID]);
  });

  test("auto-accepts the folder trust prompt with Enter", () => {
    expect(
      claude.trustPromptRe.test("Do you trust the files in this folder?"),
    ).toBe(true);
    expect(claude.trustPromptRe.test("regular output")).toBe(false);
    expect(claude.trustAnswer).toBe("\r");
  });

  test("passes output through verbatim (no cursor noise filtering)", () => {
    const chunk = "Retry attempt 3\nreal output\n";
    expect(claude.filterOutput(chunk)).toBe(chunk);
  });
});
