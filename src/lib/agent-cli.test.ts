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

  test("worktree launch leads with --worktree before --resume", () => {
    expect(
      cursor.buildArgs({
        sessionId: ID,
        wrappedPrompt: "do x",
        resume: false,
        worktree: true,
      }),
    ).toEqual(["--worktree", "--resume", ID, "do x"]);
  });

  test("resume re-opens the chat without a prompt", () => {
    expect(
      cursor.buildArgs({ sessionId: ID, wrappedPrompt: "ignored", resume: true }),
    ).toEqual(["--resume", ID]);
  });

  test("resume never adds --worktree (it would create a second worktree)", () => {
    expect(
      cursor.buildArgs({
        sessionId: ID,
        wrappedPrompt: "ignored",
        resume: true,
        worktree: true,
      }),
    ).toEqual(["--resume", ID]);
  });

  test("initial launch passes --model before the positional prompt", () => {
    expect(
      cursor.buildArgs({
        sessionId: ID,
        wrappedPrompt: "do x",
        resume: false,
        cursorModel: "composer-2.5",
      }),
    ).toEqual(["--resume", ID, "--model", "composer-2.5", "do x"]);
  });

  test("worktree launch keeps order: --worktree, --resume, --model, prompt", () => {
    expect(
      cursor.buildArgs({
        sessionId: ID,
        wrappedPrompt: "do x",
        resume: false,
        worktree: true,
        cursorModel: "gpt-5.3-codex-high",
      }),
    ).toEqual([
      "--worktree",
      "--resume",
      ID,
      "--model",
      "gpt-5.3-codex-high",
      "do x",
    ]);
  });

  test("resume re-passes --model (per-invocation, not pinned to the chat)", () => {
    expect(
      cursor.buildArgs({
        sessionId: ID,
        wrappedPrompt: "ignored",
        resume: true,
        cursorModel: "composer-2.5",
      }),
    ).toEqual(["--resume", ID, "--model", "composer-2.5"]);
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

  test("initial launch pins the pre-issued UUID via --session-id in auto permission mode", () => {
    expect(
      claude.buildArgs({ sessionId: ID, wrappedPrompt: "do x", resume: false }),
    ).toEqual(["--session-id", ID, "--permission-mode", "auto", "do x"]);
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
    ).toEqual([
      "--session-id",
      ID,
      "--permission-mode",
      "auto",
      "--model",
      "sonnet",
      "--effort",
      "high",
      "do x",
    ]);
  });

  test("worktree launch leads with --worktree before --session-id", () => {
    expect(
      claude.buildArgs({
        sessionId: ID,
        wrappedPrompt: "do x",
        resume: false,
        worktree: true,
        claudeModel: "sonnet",
        claudeEffort: "high",
      }),
    ).toEqual([
      "--worktree",
      "--session-id",
      ID,
      "--permission-mode",
      "auto",
      "--model",
      "sonnet",
      "--effort",
      "high",
      "do x",
    ]);
  });

  test("resume re-opens the conversation by id in auto permission mode", () => {
    expect(
      claude.buildArgs({ sessionId: ID, wrappedPrompt: "ignored", resume: true }),
    ).toEqual(["--resume", ID, "--permission-mode", "auto"]);
  });

  test("resume never adds --worktree (it would create a second worktree)", () => {
    expect(
      claude.buildArgs({
        sessionId: ID,
        wrappedPrompt: "ignored",
        resume: true,
        worktree: true,
      }),
    ).toEqual(["--resume", ID, "--permission-mode", "auto"]);
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

describe("cline CLI", () => {
  const cline = AGENT_CLIS.cline;

  test("initial launch opens the TUI, auto-approves, prompt last — NO --id", () => {
    // cline's --id is resume-only; passing it on a fresh launch would skip the
    // prompt. So the initial launch omits --id (cline mints its own id, which
    // pty-registry captures from cline's sessions database afterward). No model/effort →
    // neither -m nor --thinking is emitted.
    expect(
      cline.buildArgs({ sessionId: ID, wrappedPrompt: "do x", resume: false }),
    ).toEqual(["-i", "--auto-approve", "true", "-P", "cline-pass", "do x"]);
  });

  test("initial launch passes the clinepass model and --thinking effort, still no --id", () => {
    expect(
      cline.buildArgs({
        sessionId: ID,
        wrappedPrompt: "do x",
        resume: false,
        clineModel: "cline-pass/glm-5.2",
        clineEffort: "high",
      }),
    ).toEqual([
      "-i",
      "--auto-approve",
      "true",
      "-P",
      "cline-pass",
      "-m",
      "cline-pass/glm-5.2",
      "--thinking",
      "high",
      "do x",
    ]);
  });

  test("worktree launch leads with --worktree, keeps the prompt last", () => {
    expect(
      cline.buildArgs({
        sessionId: ID,
        wrappedPrompt: "do x",
        resume: false,
        worktree: true,
        clineModel: "cline-pass/glm-5.2",
        clineEffort: "high",
      }),
    ).toEqual([
      "--worktree",
      "-i",
      "--auto-approve",
      "true",
      "-P",
      "cline-pass",
      "-m",
      "cline-pass/glm-5.2",
      "--thinking",
      "high",
      "do x",
    ]);
  });

  test("resume re-opens the captured id with no prompt, re-passing model and effort", () => {
    expect(
      cline.buildArgs({
        sessionId: ID,
        wrappedPrompt: "ignored",
        resume: true,
        clineModel: "cline-pass/glm-5.2",
        clineEffort: "high",
      }),
    ).toEqual([
      "-i",
      "--auto-approve",
      "true",
      "-P",
      "cline-pass",
      "-m",
      "cline-pass/glm-5.2",
      "--thinking",
      "high",
      "--id",
      ID,
    ]);
  });

  test("resume passes --id but never --worktree (it would create a second worktree)", () => {
    expect(
      cline.buildArgs({
        sessionId: ID,
        wrappedPrompt: "ignored",
        resume: true,
        worktree: true,
      }),
    ).toEqual(["-i", "--auto-approve", "true", "-P", "cline-pass", "--id", ID]);
  });

  test("has no workspace-trust prompt to answer (inert matcher)", () => {
    expect(cline.trustPromptRe.test("Do you trust the files in this folder?")).toBe(
      false,
    );
    expect(cline.trustPromptRe.test("anything at all")).toBe(false);
    expect(cline.trustAnswer).toBe("");
  });

  test("passes output through verbatim (no noise filtering)", () => {
    const chunk = "Retry attempt 3\nreal output\n";
    expect(cline.filterOutput(chunk)).toBe(chunk);
  });
});
