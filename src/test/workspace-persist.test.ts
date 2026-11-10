import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => { localStorage.clear(); vi.resetModules(); });

describe("workspace is saved across reloads", () => {
  it("restores the open project, its edits and created projects", async () => {
    const first = (await import("@/lib/workspace")).workspace;
    first._reset();
    first.create("mysite", "blank-app");
    first.writeFile("index.html", "<h1>SAVED</h1>");
    first.setActive("styles.css");

    vi.resetModules(); // simulates a page reload: fresh module state
    const second = (await import("@/lib/workspace")).workspace;
    const unsub = second.subscribe(() => {});
    expect(second.get().project).toBe("mysite");
    expect(second.get().files["index.html"]).toBe("<h1>SAVED</h1>");
    expect(second.get().active).toBe("styles.css");
    expect(second.projectNames()).toContain("mysite");
    unsub();
  });

  it("ignores corrupt saved data", async () => {
    localStorage.setItem("og-workspace-v1", "{not json");
    const ws = (await import("@/lib/workspace")).workspace;
    const unsub = ws.subscribe(() => {});
    expect(ws.get().project).toBe("blank-app");
    unsub();
  });
});
