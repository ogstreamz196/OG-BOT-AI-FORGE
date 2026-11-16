import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GitSync, isUndo } from "@/components/studio/GitSync";
import { OllamaTester, speedOf } from "@/components/studio/OllamaTester";
import { driveLink } from "@/lib/drive-link";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Change history", () => {
  it("filters by who made it, searches, and offers Restore on undo commits", async () => {
    vi.spyOn(driveLink, "get").mockReturnValue({ mode: "local", base: "http://127.0.0.1:11500", status: null, message: "" });
    const commits = [
      { sha: "a".repeat(40), short: "aaaaaaa", author: "OG BOT", time: 0, subject: "OG BOT autofix: crash" },
      { sha: "b".repeat(40), short: "bbbbbbb", author: "gpt-engineer-app[bot]", time: 0, subject: "Changes from Lovable" },
      { sha: "c".repeat(40), short: "ccccccc", author: "OG BOT", time: 0, subject: 'Revert "OG BOT idea: bigger titles"' },
    ];
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ commits })));
    render(<GitSync />);
    await act(async () => {});
    expect(isUndo(commits[2]!)).toBe(true);
    expect(screen.getByRole("button", { name: /Restore/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "OG BOT" }));
    expect(screen.queryByText("Changes from Lovable")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Search changes"), { target: { value: "crash" } });
    expect(screen.getByText("OG BOT autofix: crash")).toBeInTheDocument();
    expect(screen.queryByText(/bigger titles/)).not.toBeInTheDocument();
  });
});

describe("Engine Test", () => {
  it("works out speed from Ollama's timings", () => {
    expect(speedOf({ eval_count: 100, eval_duration: 2e9, load_duration: 1.5e9, total_duration: 4e9 })).toEqual({ tokPerSec: 50, loadSec: 1.5, totalSec: 4 });
  });
  it("tests every installed model and shows the results", async () => {
    Element.prototype.scrollIntoView ??= () => {};
    vi.spyOn(globalThis, "fetch").mockImplementation(async (u, init) => {
      if (String(u).endsWith("/api/tags")) return new Response(JSON.stringify({ models: [{ name: "a:7b" }, { name: "b:14b" }] }));
      const body = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ message: { content: body.model === "a:7b" ? "PONG" : "hello" }, eval_count: 10, eval_duration: 1e9 }));
    });
    render(<OllamaTester />);
    await act(async () => {});
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Test all models" }));
    });
    expect(screen.getByText("✓ answers")).toBeInTheDocument();
    expect(screen.getByText(/✗ answered, but not PONG/)).toBeInTheDocument();
    expect(screen.getAllByText("10 tok/s").length).toBe(2);
  });
});
