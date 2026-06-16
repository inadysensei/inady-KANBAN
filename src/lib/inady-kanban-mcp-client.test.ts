import { describe, expect, it, vi } from "vitest";
import {
  apiCreateTicket,
  apiGetTicket,
  apiListTickets,
  apiUpdateTicket,
} from "./inady-kanban-mcp-client";

/**
 * A minimal stand-in for the part of `fetch`'s Response that the client touches
 * (`ok`, `status`, `json()`), so the pure request/parse/error-shaping logic can
 * be exercised without a live server.
 */
function fakeResponse(
  body: unknown,
  init?: { ok?: boolean; status?: number },
): Response {
  return {
    ok: init?.ok ?? true,
    status: init?.status ?? 200,
    json: async () => body,
  } as unknown as Response;
}

const BASE = "http://localhost:9999";

describe("apiCreateTicket", () => {
  it("POSTs to /api/tickets and returns the new id", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      fakeResponse({ ok: true, id: "t-1" }),
    );
    const result = await apiCreateTicket(
      { title: "Hi", description: "d", memo: "m", workingDir: "/repo" },
      { baseUrl: BASE, fetchImpl },
    );
    expect(result).toEqual({ id: "t-1" });

    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe(`${BASE}/api/tickets`);
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body)).toEqual({
      title: "Hi",
      description: "d",
      memo: "m",
      workingDir: "/repo",
    });
  });

  it("rejects with the server's error message on { ok: false }", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      fakeResponse({ ok: false, error: "title is required" }, {
        ok: false,
        status: 400,
      }),
    );
    await expect(
      apiCreateTicket({ title: "", workingDir: "/repo" }, {
        baseUrl: BASE,
        fetchImpl,
      }),
    ).rejects.toThrow(/title is required/);
  });

  it("explains the server is unreachable when fetch itself fails", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("fetch failed"));
    await expect(
      apiCreateTicket({ title: "x", workingDir: "/repo" }, {
        baseUrl: BASE,
        fetchImpl,
      }),
    ).rejects.toThrow(/Could not reach the Kanban server at http:\/\/localhost:9999/);
  });
});

describe("apiGetTicket", () => {
  it("GETs /api/tickets/:id and returns the ticket", async () => {
    const ticket = { id: "t-1", title: "Hi", status: "todo" };
    const fetchImpl = vi.fn().mockResolvedValue(
      fakeResponse({ ok: true, ticket }),
    );
    const result = await apiGetTicket("t-1", { baseUrl: BASE, fetchImpl });
    expect(result).toEqual(ticket);

    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe(`${BASE}/api/tickets/t-1`);
    expect(options.method).toBe("GET");
  });

  it("rejects with the server's error on a missing ticket", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      fakeResponse({ ok: false, error: "ticket not found" }, {
        ok: false,
        status: 404,
      }),
    );
    await expect(
      apiGetTicket("nope", { baseUrl: BASE, fetchImpl }),
    ).rejects.toThrow(/ticket not found/);
  });
});

describe("apiListTickets", () => {
  it("GETs /api/tickets with no query when no filter is given", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      fakeResponse({ ok: true, tickets: [] }),
    );
    const result = await apiListTickets({}, { baseUrl: BASE, fetchImpl });
    expect(result).toEqual([]);
    expect(fetchImpl.mock.calls[0][0]).toBe(`${BASE}/api/tickets`);
  });

  it("appends ?status= when filtering by status", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      fakeResponse({ ok: true, tickets: [{ id: "t-1" }] }),
    );
    const result = await apiListTickets(
      { status: "todo" },
      { baseUrl: BASE, fetchImpl },
    );
    expect(result).toEqual([{ id: "t-1" }]);
    expect(fetchImpl.mock.calls[0][0]).toBe(`${BASE}/api/tickets?status=todo`);
  });
});

describe("apiUpdateTicket", () => {
  it("PATCHes /api/tickets/:id with the patch and returns the updated ticket", async () => {
    const ticket = { id: "t-1", title: "New", status: "todo" };
    const fetchImpl = vi.fn().mockResolvedValue(
      fakeResponse({ ok: true, ticket }),
    );
    const result = await apiUpdateTicket(
      "t-1",
      { title: "New" },
      { baseUrl: BASE, fetchImpl },
    );
    expect(result).toEqual(ticket);

    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe(`${BASE}/api/tickets/t-1`);
    expect(options.method).toBe("PATCH");
    expect(JSON.parse(options.body)).toEqual({ title: "New" });
  });
});
