import { describe, expect, test } from "vitest";
import { cleanChosenFolderPath, parseWorkingDirs } from "./working-dirs";

describe("parseWorkingDirs", () => {
  test("returns [] for non-array input", () => {
    expect(parseWorkingDirs(null)).toEqual([]);
    expect(parseWorkingDirs(undefined)).toEqual([]);
    expect(parseWorkingDirs("/abs/path")).toEqual([]);
    expect(parseWorkingDirs({ path: "/abs/path" })).toEqual([]);
  });

  test("keeps absolute string paths in order", () => {
    expect(parseWorkingDirs(["/a", "/b/c"])).toEqual(["/a", "/b/c"]);
  });

  test("trims whitespace and drops blanks", () => {
    expect(parseWorkingDirs(["  /a  ", "   ", ""])).toEqual(["/a"]);
  });

  test("drops non-string and relative entries", () => {
    expect(parseWorkingDirs(["/a", 42, null, "relative/path", "./b"])).toEqual([
      "/a",
    ]);
  });

  test("de-duplicates, preserving first occurrence", () => {
    expect(parseWorkingDirs(["/a", "/b", "/a", " /b "])).toEqual(["/a", "/b"]);
  });
});

describe("cleanChosenFolderPath", () => {
  test("strips the trailing slash and newline osascript appends", () => {
    expect(cleanChosenFolderPath("/Users/me/code/\n")).toBe("/Users/me/code");
    expect(cleanChosenFolderPath("  /Users/me/code/  ")).toBe("/Users/me/code");
  });

  test("collapses multiple trailing slashes", () => {
    expect(cleanChosenFolderPath("/a/b///")).toBe("/a/b");
  });

  test("keeps a path without a trailing slash unchanged", () => {
    expect(cleanChosenFolderPath("/Users/me/code")).toBe("/Users/me/code");
  });

  test("preserves the filesystem root", () => {
    expect(cleanChosenFolderPath("/")).toBe("/");
  });

  test("returns empty string for blank/cancelled input", () => {
    expect(cleanChosenFolderPath("")).toBe("");
    expect(cleanChosenFolderPath("   \n")).toBe("");
  });
});
