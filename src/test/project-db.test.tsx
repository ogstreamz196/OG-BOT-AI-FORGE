import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseQuery, remoteDb, runLocal, tablesFromOpenApi } from "@/lib/project-db";
import { Database } from "@/components/studio/Database";
import { connectors } from "@/lib/connectors";

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("project database helpers", () => {
  it("parses the console's query syntax", () => {
    expect(parseQuery("SELECT * FROM notes")).toEqual({ table: "notes" });
    expect(parseQuery("select * from notes where done = 'no';")).toEqual({ table: "notes", col: "done", val: "no" });
    expect(parseQuery("DROP TABLE x")).toBeNull();
  });
  it("reads table names from PostgREST", () => {
    expect(tablesFromOpenApi({ definitions: { b: {}, a: {} } })).toEqual(["a", "b"]);
    expect(tablesFromOpenApi({ paths: { "/": {}, "/todos": {}, "/rpc/x": {} } })).toEqual(["todos"]);
  });
  it("filters local tables", () => {
    expect(runLocal({ t: [{ a: 1 }, { a: 2 }] }, { table: "t", col: "a", val: "2" })).toEqual([{ a: 2 }]);
    expect(runLocal({}, { table: "nope" })).toMatch(/No table/);
  });
  it("talks to Supabase REST with the publishable key and explains RLS refusals", async () => {
    const f = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify([{ id: 1 }])));
    await remoteDb.select({ url: "https://p.supabase.co/", key: "pk" }, { table: "todos", col: "done", val: "no" });
    const [url, init] = f.mock.calls[0]!;
    expect(String(url)).toBe("https://p.supabase.co/rest/v1/todos?select=*&limit=50&done=eq.no");
    expect((init!.headers as Record<string, string>)["apikey"]).toBe("pk");
    f.mockResolvedValueOnce(new Response(JSON.stringify({ message: "denied" }), { status: 401 }));
    await expect(remoteDb.insert({ url: "https://p.supabase.co", key: "pk" }, "todos", { a: 1 })).rejects.toThrow(/row-level security/);
  });
});

describe("Database screen", () => {
  it("works with local tables when no backend is connected, and saves them", async () => {
    vi.spyOn(connectors, "isEnabled").mockReturnValue(false);
    render(<Database />);
    await act(async () => {});
    expect(screen.getByText(/Connect Supabase in Connectors/)).toBeInTheDocument();
    expect(screen.queryByText("Faiyaz")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("New title"), { target: { value: "buy milk" } });
    fireEvent.click(screen.getByRole("button", { name: "Insert row" }));
    expect(screen.getByText("buy milk")).toBeInTheDocument();
    expect(localStorage.getItem("og-local-db-v1")).toContain("buy milk");
  });
});
