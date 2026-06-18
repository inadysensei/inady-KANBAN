import { describe, expect, test } from "vitest";
import { parseDiff, parseNulList } from "./diff-view";

describe("parseDiff", () => {
  test("empty input yields no files", () => {
    expect(parseDiff("")).toEqual([]);
    expect(parseDiff("\n")).toEqual([]);
  });

  test("a modified file: paths, hunk header, and add/del counts", () => {
    const raw = [
      "diff --git a/foo.ts b/foo.ts",
      "index 1111111..2222222 100644",
      "--- a/foo.ts",
      "+++ b/foo.ts",
      "@@ -1,3 +1,4 @@",
      " keep",
      "-removed",
      "+added",
      "+added2",
      "",
    ].join("\n");

    const files = parseDiff(raw);
    expect(files).toHaveLength(1);
    const f = files[0];
    expect(f.path).toBe("foo.ts");
    expect(f.oldPath).toBe("foo.ts");
    expect(f.newPath).toBe("foo.ts");
    expect(f.additions).toBe(2);
    expect(f.deletions).toBe(1);
    expect(f.binary).toBe(false);
    // Header lines (diff --git / index / --- / +++) are not part of the body.
    expect(f.lines).toEqual([
      { type: "hunk", text: "@@ -1,3 +1,4 @@" },
      { type: "context", text: " keep" },
      { type: "del", text: "-removed" },
      { type: "add", text: "+added" },
      { type: "add", text: "+added2" },
    ]);
  });

  test("a new file: old side is /dev/null (null), path is the new name", () => {
    const raw = [
      "diff --git a/new.ts b/new.ts",
      "new file mode 100644",
      "index 0000000..3333333",
      "--- /dev/null",
      "+++ b/new.ts",
      "@@ -0,0 +1,2 @@",
      "+line1",
      "+line2",
    ].join("\n");

    const [f] = parseDiff(raw);
    expect(f.oldPath).toBeNull();
    expect(f.newPath).toBe("new.ts");
    expect(f.path).toBe("new.ts");
    expect(f.additions).toBe(2);
    expect(f.deletions).toBe(0);
  });

  test("a deleted file: new side is /dev/null (null), path is the old name", () => {
    const raw = [
      "diff --git a/old.ts b/old.ts",
      "deleted file mode 100644",
      "index 3333333..0000000",
      "--- a/old.ts",
      "+++ /dev/null",
      "@@ -1,2 +0,0 @@",
      "-line1",
      "-line2",
    ].join("\n");

    const [f] = parseDiff(raw);
    expect(f.oldPath).toBe("old.ts");
    expect(f.newPath).toBeNull();
    expect(f.path).toBe("old.ts");
    expect(f.deletions).toBe(2);
    expect(f.additions).toBe(0);
  });

  test("a pure rename survives path extraction with no hunk body", () => {
    const raw = [
      "diff --git a/oldname.ts b/newname.ts",
      "similarity index 100%",
      "rename from oldname.ts",
      "rename to newname.ts",
    ].join("\n");

    const [f] = parseDiff(raw);
    expect(f.oldPath).toBe("oldname.ts");
    expect(f.newPath).toBe("newname.ts");
    expect(f.path).toBe("newname.ts");
    expect(f.lines).toEqual([]);
    expect(f.additions).toBe(0);
    expect(f.deletions).toBe(0);
    expect(f.binary).toBe(false);
  });

  test("a binary file is flagged with no +/- coloring", () => {
    const raw = [
      "diff --git a/img.png b/img.png",
      "index 1111111..2222222 100644",
      "Binary files a/img.png and b/img.png differ",
    ].join("\n");

    const [f] = parseDiff(raw);
    expect(f.binary).toBe(true);
    expect(f.path).toBe("img.png");
    expect(f.lines).toEqual([]);
    expect(f.additions).toBe(0);
    expect(f.deletions).toBe(0);
  });

  test("a path with spaces is read from the --- / +++ lines", () => {
    const raw = [
      "diff --git a/my file.ts b/my file.ts",
      "index 1111111..2222222 100644",
      "--- a/my file.ts",
      "+++ b/my file.ts",
      "@@ -1 +1 @@",
      "-a",
      "+b",
    ].join("\n");

    const [f] = parseDiff(raw);
    expect(f.path).toBe("my file.ts");
    expect(f.oldPath).toBe("my file.ts");
    expect(f.newPath).toBe("my file.ts");
  });

  test("multiple files are split at each diff --git boundary", () => {
    const raw = [
      "diff --git a/a.ts b/a.ts",
      "--- a/a.ts",
      "+++ b/a.ts",
      "@@ -1 +1 @@",
      "-x",
      "+y",
      "diff --git a/b.ts b/b.ts",
      "--- a/b.ts",
      "+++ b/b.ts",
      "@@ -1 +1 @@",
      "-1",
      "+2",
    ].join("\n");

    const files = parseDiff(raw);
    expect(files.map((f) => f.path)).toEqual(["a.ts", "b.ts"]);
    expect(files[0].additions).toBe(1);
    expect(files[1].deletions).toBe(1);
  });

  test('"\\ No newline at end of file" markers are ignored', () => {
    const raw = [
      "diff --git a/n.ts b/n.ts",
      "--- a/n.ts",
      "+++ b/n.ts",
      "@@ -1 +1 @@",
      "-old",
      "\\ No newline at end of file",
      "+new",
      "\\ No newline at end of file",
    ].join("\n");

    const [f] = parseDiff(raw);
    expect(f.additions).toBe(1);
    expect(f.deletions).toBe(1);
    expect(f.lines.some((l) => l.text.startsWith("\\"))).toBe(false);
  });

  test("truncated input (cut mid-line) does not throw and keeps the partial line", () => {
    const raw = [
      "diff --git a/big.ts b/big.ts",
      "--- a/big.ts",
      "+++ b/big.ts",
      "@@ -1,2 +1,2 @@",
      " context",
      "+partial line that got cut o", // no newline — stream was truncated here
    ].join("\n");

    let files: ReturnType<typeof parseDiff> = [];
    expect(() => {
      files = parseDiff(raw);
    }).not.toThrow();
    expect(files).toHaveLength(1);
    expect(files[0].additions).toBe(1);
    expect(files[0].lines.at(-1)).toEqual({
      type: "add",
      text: "+partial line that got cut o",
    });
  });

  test("lines before the first diff --git header are ignored", () => {
    const raw = ["warning: noise", "diff --git a/x.ts b/x.ts", "--- a/x.ts", "+++ b/x.ts", "@@ -1 +1 @@", "+y"].join(
      "\n",
    );
    const files = parseDiff(raw);
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe("x.ts");
  });
});

describe("parseNulList", () => {
  test("splits NUL-separated entries and drops empties", () => {
    expect(parseNulList("a.ts\0src/b.ts\0")).toEqual(["a.ts", "src/b.ts"]);
  });

  test("handles a single entry with no trailing NUL", () => {
    expect(parseNulList("only.ts")).toEqual(["only.ts"]);
  });

  test("empty input yields an empty list", () => {
    expect(parseNulList("")).toEqual([]);
    expect(parseNulList("\0\0")).toEqual([]);
  });
});
