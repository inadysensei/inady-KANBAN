import { describe, expect, test } from "vitest";
import type { Ticket, TicketStatus } from "../db/schema";
import {
  computeDragResult,
  groupByStatus,
  isBoardFilterActive,
  MIN_GAP,
  narrowColumn,
  orderDoneColumn,
  tallySessionCounts,
  ticketMatchesQuery,
} from "./board-order";

const STATUSES: TicketStatus[] = ["todo", "doing", "wip", "done", "icebox"];

function ticket(
  id: string,
  status: TicketStatus,
  position: number,
  opts: {
    createdAt?: number;
    updatedAt?: number;
    doneAt?: number;
    title?: string;
    workingDir?: string;
    deadline?: number | null;
  } = {},
): Ticket {
  return {
    id,
    title: opts.title ?? id,
    description: "",
    memo: "",
    status,
    workingDir: opts.workingDir ?? "/w",
    position,
    createdAt: opts.createdAt ?? 0,
    updatedAt: opts.updatedAt ?? 0,
    doneAt: opts.doneAt ?? null,
    deadline: opts.deadline ?? null,
  };
}

const group = (...ts: Ticket[]) => groupByStatus(ts, STATUSES);

describe("groupByStatus", () => {
  test("buckets by status and sorts each column by position", () => {
    const g = groupByStatus(
      [ticket("b", "todo", 2), ticket("a", "todo", 1), ticket("x", "done", 5)],
      STATUSES,
    );
    expect(g.todo.map((t) => t.id)).toEqual(["a", "b"]);
    expect(g.done.map((t) => t.id)).toEqual(["x"]);
    expect(g.doing).toEqual([]);
    expect(g.wip).toEqual([]);
  });
});

describe("computeDragResult — same column", () => {
  test("move to top → position just below the new next", () => {
    const g = group(ticket("a", "todo", 1), ticket("b", "todo", 2), ticket("c", "todo", 3));
    expect(computeDragResult(g, "c", "a")).toEqual({
      kind: "move",
      update: { id: "c", status: "todo", position: 0 },
    });
  });

  test("move to middle → averaged position", () => {
    const g = group(ticket("a", "todo", 1), ticket("b", "todo", 2), ticket("c", "todo", 3));
    expect(computeDragResult(g, "c", "b")).toEqual({
      kind: "move",
      update: { id: "c", status: "todo", position: 1.5 },
    });
  });

  test("dropping on the column area moves to the bottom", () => {
    const g = group(ticket("a", "todo", 1), ticket("b", "todo", 2), ticket("c", "todo", 3));
    expect(computeDragResult(g, "a", "todo")).toEqual({
      kind: "move",
      update: { id: "a", status: "todo", position: 4 },
    });
  });
});

describe("computeDragResult — cross column", () => {
  test("insert before a card → averaged position in the target column", () => {
    const g = group(ticket("a", "todo", 1), ticket("x", "doing", 1), ticket("y", "doing", 2));
    expect(computeDragResult(g, "a", "y")).toEqual({
      kind: "move",
      update: { id: "a", status: "doing", position: 1.5 },
    });
  });

  test("dropping on a column appends to the end", () => {
    const g = group(ticket("a", "todo", 1), ticket("x", "doing", 1), ticket("y", "doing", 2));
    expect(computeDragResult(g, "a", "doing")).toEqual({
      kind: "move",
      update: { id: "a", status: "doing", position: 3 },
    });
  });

  test("dropping into an empty column → position 1", () => {
    const g = group(ticket("a", "todo", 1));
    expect(computeDragResult(g, "a", "done")).toEqual({
      kind: "move",
      update: { id: "a", status: "done", position: 1 },
    });
  });
});

describe("computeDragResult — Ice Box (count-only tile)", () => {
  test("dropping a card onto the Ice Box column id parks it (move, status=icebox)", () => {
    // The board excludes Ice Box tickets, so the `icebox` bucket groupByStatus
    // builds is always empty — a drop onto the tile lands at position 1. This is
    // what makes the droppable `id:"icebox"` tile route through the normal math.
    const g = group(ticket("a", "todo", 1), ticket("b", "todo", 2));
    expect(computeDragResult(g, "a", "icebox")).toEqual({
      kind: "move",
      update: { id: "a", status: "icebox", position: 1 },
    });
  });

  test("dropping a card onto a different empty column still works alongside icebox", () => {
    // Guards that widening the status set didn't disturb other empty-column drops.
    const g = group(ticket("a", "todo", 1));
    expect(computeDragResult(g, "a", "wip")).toEqual({
      kind: "move",
      update: { id: "a", status: "wip", position: 1 },
    });
  });
});

describe("computeDragResult — rebalance + no-ops", () => {
  test("tight neighbor gap triggers a full-column renumber", () => {
    const g = group(
      ticket("a", "todo", 1),
      ticket("x", "doing", 1),
      ticket("y", "doing", 1 + MIN_GAP / 2),
    );
    expect(computeDragResult(g, "a", "y")).toEqual({
      kind: "reorder",
      status: "doing",
      orderedIds: ["x", "a", "y"],
      updates: [
        { id: "x", status: "doing", position: 1 },
        { id: "a", status: "doing", position: 2 },
        { id: "y", status: "doing", position: 3 },
      ],
    });
  });

  test("returns null when dropped on itself", () => {
    const g = group(ticket("a", "todo", 1), ticket("b", "todo", 2));
    expect(computeDragResult(g, "a", "a")).toBeNull();
  });

  test("returns null for an unknown active id", () => {
    const g = group(ticket("a", "todo", 1));
    expect(computeDragResult(g, "ghost", "a")).toBeNull();
  });
});

describe("orderDoneColumn", () => {
  test("orders by updatedAt descending (most recent first), ignoring position", () => {
    const ts = [
      ticket("old", "done", 1, { updatedAt: 100 }),
      ticket("new", "done", 2, { updatedAt: 300 }),
      ticket("mid", "done", 3, { updatedAt: 200 }),
    ];
    expect(orderDoneColumn(ts).map((t) => t.id)).toEqual(["new", "mid", "old"]);
  });

  test("ties on updatedAt fall back to createdAt descending", () => {
    const ts = [
      ticket("older", "done", 1, { updatedAt: 100, createdAt: 10 }),
      ticket("newer", "done", 2, { updatedAt: 100, createdAt: 20 }),
    ];
    expect(orderDoneColumn(ts).map((t) => t.id)).toEqual(["newer", "older"]);
  });

  test("ties on both timestamps fall back to id for determinism", () => {
    const ts = [ticket("b", "done", 1), ticket("a", "done", 2)];
    expect(orderDoneColumn(ts).map((t) => t.id)).toEqual(["a", "b"]);
  });

  test("returns a new array and leaves the input untouched", () => {
    const ts = [
      ticket("a", "done", 1, { updatedAt: 1 }),
      ticket("b", "done", 2, { updatedAt: 2 }),
    ];
    const out = orderDoneColumn(ts);
    expect(out).not.toBe(ts);
    expect(ts.map((t) => t.id)).toEqual(["a", "b"]);
  });
});

describe("tallySessionCounts", () => {
  test("builds zero-filled per-ticket counts and splits running by hook activity", () => {
    expect(
      tallySessionCounts([
        // running splits into up to three grouped rows (busy / awaiting /
        // unknown) for one ticket, by the hook-reported activity.
        { ticketId: "t1", status: "running", activity: "busy", count: 2 },
        { ticketId: "t1", status: "running", activity: "awaiting", count: 1 },
        { ticketId: "t1", status: "running", activity: null, count: 1 },
        { ticketId: "t1", status: "error", activity: null, count: 1 },
        { ticketId: "t2", status: "finished", activity: null, count: 3 },
      ]),
    ).toEqual({
      t1: { running: 4, busy: 2, awaiting: 1, finished: 0, error: 1, killed: 0 },
      t2: { running: 0, busy: 0, awaiting: 0, finished: 3, error: 0, killed: 0 },
    });
  });

  test("returns an empty record when there are no rows", () => {
    expect(tallySessionCounts([])).toEqual({});
  });
});

describe("ticketMatchesQuery", () => {
  const t = { title: "Fix login flow", workingDir: "/Users/me/web-app" };

  test("an empty / whitespace query matches everything", () => {
    expect(ticketMatchesQuery(t, "")).toBe(true);
    expect(ticketMatchesQuery(t, "   ")).toBe(true);
  });

  test("case-insensitive substring of the title matches", () => {
    expect(ticketMatchesQuery(t, "LOGIN")).toBe(true);
  });

  test("case-insensitive substring of the working dir matches", () => {
    expect(ticketMatchesQuery(t, "web-app")).toBe(true);
    expect(ticketMatchesQuery(t, "/users/ME")).toBe(true);
  });

  test("a query found in neither title nor dir does not match", () => {
    expect(ticketMatchesQuery(t, "logout")).toBe(false);
  });

  test("surrounding whitespace in the query is trimmed", () => {
    expect(ticketMatchesQuery(t, "  login  ")).toBe(true);
  });
});

describe("isBoardFilterActive", () => {
  test("false only when no filter is set", () => {
    expect(isBoardFilterActive({ query: "", activeTagIds: [] })).toBe(false);
    expect(isBoardFilterActive({ query: "   ", activeTagIds: [] })).toBe(false);
  });

  test("true when either filter is set", () => {
    expect(isBoardFilterActive({ query: "x", activeTagIds: [] })).toBe(true);
    expect(isBoardFilterActive({ query: "", activeTagIds: ["t"] })).toBe(true);
  });
});

describe("narrowColumn", () => {
  const a = ticket("a", "todo", 1, { title: "Fix login", workingDir: "/app/web" });
  const b = ticket("b", "todo", 2, { title: "Add logout", workingDir: "/app/api" });
  const c = ticket("c", "todo", 3, { title: "Write docs", workingDir: "/app/docs" });
  const column = [a, b, c];
  const side = {
    ticketTags: { a: [{ id: "high", name: "High", color: "#ef4444" }], b: [{ id: "low", name: "Low", color: "#22c55e" }] },
  };

  test("returns the same array reference when no filter is active (board restored)", () => {
    const out = narrowColumn(column, { query: "", activeTagIds: [] }, side);
    expect(out).toBe(column);
  });

  test("search narrows by title/dir substring", () => {
    const out = narrowColumn(column, { query: "log", activeTagIds: [] }, side);
    expect(out.map((t) => t.id)).toEqual(["a", "b"]); // "login", "logout"
  });

  test("tag filter keeps only carriers of an active tag", () => {
    const out = narrowColumn(column, { query: "", activeTagIds: ["high"] }, side);
    expect(out.map((t) => t.id)).toEqual(["a"]);
  });

  test("the two filters compose with AND", () => {
    // "log" matches a + b; tag High keeps only a — so AND yields a.
    expect(
      narrowColumn(column, { query: "log", activeTagIds: ["high"] }, side).map((t) => t.id),
    ).toEqual(["a"]);
    // A query that matches none of High's carriers yields nothing.
    expect(
      narrowColumn(column, { query: "docs", activeTagIds: ["high"] }, side).map((t) => t.id),
    ).toEqual([]);
  });

  test("preserves the input order of the surviving tickets", () => {
    const out = narrowColumn([c, b, a], { query: "lo", activeTagIds: [] }, side);
    expect(out.map((t) => t.id)).toEqual(["b", "a"]); // "logout", "login"
  });
});
