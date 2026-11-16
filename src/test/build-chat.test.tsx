import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Chat } from "@/components/studio/Chat";
import { Md } from "@/components/studio/Md";
import { diffHunks, lineDiff, makeEdit, trimEdits, undoPatch } from "@/lib/chat-edits";
import { workspace } from "@/lib/workspace";
import { connectors } from "@/lib/connectors";

beforeEach(() => {
  Element.prototype.scrollIntoView ??= () => {};
  workspace._reset();
});
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("edit records", () => {
  it("diffs lines and counts changes", () => {
    const d = lineDiff("a\nb\nc", "a\nB\nc\nd");
    expect(d.filter((l) => l.t === "add").map((l) => l.s)).toEqual(["B", "d"]);
    expect(d.filter((l) => l.t === "del").map((l) => l.s)).toEqual(["b"]);
    const e = makeEdit({ "x.html": "a\nb" }, { "x.html": "a\nc", "y.css": "" })!;
    expect(Object.keys(e.files)).toEqual(["x.html"]);
    expect([e.added, e.removed]).toEqual([1, 1]);
    expect(makeEdit({ a: "1" }, { a: "1" })).toBeNull();
  });
  it("shows only changed lines with context", () => {
    const before = Array.from({ length: 20 }, (_, i) => `l${i}`).join("\n");
    const after = before.replace("l10", "L10");
    const h = diffHunks(lineDiff(before, after));
    expect(h.some((l) => l.t === "gap")).toBe(true);
    expect(h.length).toBeLessThan(12);
  });
  it("undo restores and warns about later changes", () => {
    const e = makeEdit({ a: "old" }, { a: "new" })!;
    expect(undoPatch(e, { a: "new" })).toEqual({ patch: { a: "old" }, changedSince: [] });
    expect(undoPatch(e, { a: "newer" }).changedSince).toEqual(["a"]);
  });
  it("keeps only recent edit contents", () => {
    const e = makeEdit({ a: "1" }, { a: "2" })!;
    const msgs = Array.from({ length: 20 }, () => ({ role: "ai" as const, text: "x", edit: e }));
    const out = trimEdits(msgs, 15);
    expect(out.filter((x) => x.edit).length).toBe(15);
    expect(out[0]).toMatchObject({ editTrimmed: true });
  });
});

describe("Markdown replies", () => {
  it("renders code, lists and bold without HTML", () => {
    render(<Md text={"Here:\n- one\n- **two**\n```js\nconst a = 1;\n```\n<b>x</b>"} />);
    expect(screen.getByText("two").tagName).toBe("STRONG");
    expect(screen.getByText("const a = 1;").tagName).toBe("CODE");
    expect(screen.getByText("<b>x</b>")).toBeInTheDocument();
  });
});

describe("Build chat", () => {
  it("each edit is a card you can view and undo", async () => {
    vi.spyOn(connectors, "isEnabled").mockReturnValue(false);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<Chat />);
    await act(async () => {});
    fireEvent.change(screen.getByLabelText("Message OG BOT"), { target: { value: "Add a hero" } });
    await act(async () => {
      fireEvent.keyDown(screen.getByLabelText("Message OG BOT"), { key: "Enter" });
    });
    expect(workspace.get().files["index.html"]).toContain("og:start:hero");
    fireEvent.click(screen.getByRole("button", { name: /View changes/ }));
    expect(screen.getAllByText(/og:start:hero/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: /Undo this edit/ }));
    expect(workspace.get().files["index.html"]).not.toContain("og:start:hero");
    expect(screen.getByText(/Undid an edit/)).toBeInTheDocument();
  });

  it("keeps a separate chat per project", async () => {
    vi.spyOn(connectors, "isEnabled").mockReturnValue(false);
    render(<Chat />);
    await act(async () => {});
    fireEvent.change(screen.getByLabelText("Message OG BOT"), { target: { value: "Add a footer please" } });
    await act(async () => {
      fireEvent.keyDown(screen.getByLabelText("Message OG BOT"), { key: "Enter" });
    });
    expect(screen.getByText("Add a footer please")).toBeInTheDocument();
    await act(async () => {
      workspace.create("second");
    });
    expect(screen.queryByText("Add a footer please")).not.toBeInTheDocument();
    expect(screen.getByText("What shall we build?")).toBeInTheDocument();
    await act(async () => {
      workspace.open("blank-app");
    });
    expect(screen.getByText("Add a footer please")).toBeInTheDocument();
  });

  it("Stop cancels a running AI edit and changes nothing", async () => {
    vi.spyOn(connectors, "isEnabled").mockReturnValue(true);
    vi.spyOn(globalThis, "fetch").mockImplementation((_u, init) =>
      new Promise((_r, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        if (!init?.signal) reject(new Error("offline"));
      }),
    );
    const before = workspace.get().files["index.html"];
    render(<Chat />);
    await act(async () => {});
    fireEvent.change(screen.getByLabelText("Message OG BOT"), { target: { value: "make it pink" } });
    await act(async () => {
      fireEvent.keyDown(screen.getByLabelText("Message OG BOT"), { key: "Enter" });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    });
    expect(await screen.findByText(/Stopped. Nothing was changed./)).toBeInTheDocument();
    expect(workspace.get().files["index.html"]).toBe(before);
  });
});
