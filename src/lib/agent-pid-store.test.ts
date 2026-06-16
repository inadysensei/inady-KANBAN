import { describe, expect, test } from "vitest";
import { omitPidRecord, upsertPidRecord } from "./agent-pid-store";

describe("agent pid record helpers", () => {
  test("upsertPidRecord adds and replaces entries", () => {
    expect(upsertPidRecord({}, "a", 100)).toEqual({ a: 100 });
    expect(upsertPidRecord({ a: 100 }, "a", 200)).toEqual({ a: 200 });
    expect(upsertPidRecord({ a: 100 }, "b", 300)).toEqual({ a: 100, b: 300 });
  });

  test("omitPidRecord removes one entry", () => {
    expect(omitPidRecord({ a: 1, b: 2 }, "a")).toEqual({ b: 2 });
    expect(omitPidRecord({ a: 1 }, "missing")).toEqual({ a: 1 });
  });
});
