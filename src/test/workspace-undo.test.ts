import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { workspace } from "@/lib/workspace";

describe("workspace undo / redo", () => {
  beforeEach(() => workspace._reset());
  afterEach(() => vi.useRealTimers());

  it("undoes and redoes an AI edit", () => {
    const before = workspace.get().files["index.html"];
    expect(workspace.canUndo()).toBe(false);
    workspace.writeFiles({ "index.html": "<h1>AI version</h1>" });
    expect(workspace.canUndo()).toBe(true);
    expect(workspace.undo()).toBe(true);
    expect(workspace.get().files["index.html"]).toBe(before);
    expect(workspace.canRedo()).toBe(true);
    expect(workspace.redo()).toBe(true);
    expect(workspace.get().files["index.html"]).toBe("<h1>AI version</h1>");
  });

  it("a new change clears redo", () => {
    workspace.writeFiles({ "app.js": "1" });
    workspace.undo();
    workspace.writeFiles({ "app.js": "2" });
    expect(workspace.canRedo()).toBe(false);
  });

  it("groups quick typing in one file into one undo step", () => {
    vi.useFakeTimers();
    const before = workspace.get().files["styles.css"];
    workspace.writeFile("styles.css", "a");
    vi.advanceTimersByTime(300);
    workspace.writeFile("styles.css", "ab");
    vi.advanceTimersByTime(300);
    workspace.writeFile("styles.css", "abc");
    workspace.undo();
    expect(workspace.get().files["styles.css"]).toBe(before);
  });

  it("undo of a reset brings the work back", () => {
    workspace.writeFiles({ "index.html": "<p>mine</p>" });
    workspace.reset();
    workspace.undo();
    expect(workspace.get().files["index.html"]).toBe("<p>mine</p>");
  });

  it("keeps history per project", () => {
    workspace.writeFiles({ "index.html": "<p>blank edit</p>" });
    workspace.create("other");
    expect(workspace.canUndo()).toBe(false);
    workspace.open("blank-app");
    expect(workspace.canUndo()).toBe(true);
  });
});
