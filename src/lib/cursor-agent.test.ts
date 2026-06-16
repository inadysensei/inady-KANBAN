import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, test, vi } from "vitest";

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));
vi.mock("node:child_process", () => ({ spawn: spawnMock }));

import { createChat, filterStderr } from "./cursor-agent";

const ID = "11111111-2222-3333-4444-555555555555";

/** A minimal stand-in for the ChildProcess returned by spawn(). */
function fakeChild() {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
  };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  return child;
}

describe("filterStderr", () => {
  test("drops fully-matching noise lines, keeps the rest verbatim", () => {
    const input =
      "real output\nERROR: failed to copy trust settings of system certificate-25291\nRetry attempt 3\nmore output\n";
    expect(filterStderr(input)).toBe("real output\nmore output\n");
  });

  test("drops the 'Connection lost, reconnecting' noise line", () => {
    expect(filterStderr("Connection lost, reconnecting...\n")).toBe("");
  });

  test("keeps a line that only partially matches, and passes empty through", () => {
    expect(filterStderr("All retry attempts done\n")).toBe("All retry attempts done\n");
    expect(filterStderr("")).toBe("");
  });
});

describe("createChat", () => {
  beforeEach(() => spawnMock.mockReset());

  test("runs `create-chat` in the given cwd and resolves the chat UUID on exit 0", async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child);

    const p = createChat("/work/dir");
    child.stdout.emit("data", Buffer.from(`leading noise ${ID}\n`));
    child.emit("close", 0);

    await expect(p).resolves.toBe(ID);
    expect(spawnMock).toHaveBeenCalledWith(
      expect.any(String),
      ["create-chat"],
      expect.objectContaining({ cwd: "/work/dir" }),
    );
  });

  test("rejects with the filtered stderr detail on a non-zero exit", async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child);

    const p = createChat("/work/dir");
    // First line is known noise (dropped by filterStderr); the real cause remains.
    child.stderr.emit(
      "data",
      Buffer.from("ERROR: failed to copy trust settings of system certificate-1\nboom happened\n"),
    );
    child.emit("close", 1);

    await expect(p).rejects.toThrow(/exit 1/);
    await expect(p).rejects.toThrow(/boom happened/);
  });

  test("rejects when it exits 0 but prints no UUID, surfacing stdout", async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child);

    const p = createChat("/work/dir");
    child.stdout.emit("data", Buffer.from("no id here\n"));
    child.emit("close", 0);

    await expect(p).rejects.toThrow(/no id here/);
  });

  test("rejects when the binary cannot be launched", async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child);

    const p = createChat("/work/dir");
    child.emit("error", new Error("spawn ENOENT"));

    await expect(p).rejects.toThrow(/failed to launch/);
  });
});
