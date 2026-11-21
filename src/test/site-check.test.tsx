import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fixRequest, staticIssues } from "@/lib/site-check";

vi.mock("@/lib/site-check", async (orig) => {
  const real = await orig<typeof import("@/lib/site-check")>();
  // jsdom can't run the sandboxed frame: check statically only.
  return { ...real, checkSite: async (f: Record<string, string>) => real.staticIssues(f) };
});

describe("site checks", () => {
  it("finds syntax errors, missing elements, broken CSS and unbalanced tags", () => {
    const issues = staticIssues({
      "index.html": "<div><section id='a'></section>",
      "styles.css": "body{color:red",
      "app.js": "document.getElementById('b').onclick = () => {",
    }).map((i) => i.text);
    expect(issues.some((t) => /app\.js has a syntax error/.test(t))).toBe(true);
    expect(issues).toContain('app.js uses #b, but index.html has no element with id="b".');
    expect(issues.some((t) => /styles\.css has 1 "\{" but 0 "\}"/.test(t))).toBe(true);
    expect(issues.some((t) => /opens <div> 1 time\(s\) but closes it 0/.test(t))).toBe(true);
  });
  it("a clean site has no issues", () => {
    expect(staticIssues({ "index.html": "<div id='x'>Hi</div>", "styles.css": "a{color:red}", "app.js": "document.getElementById('x').textContent='ok';" })).toEqual([]);
  });
  it("builds a fix request listing every problem", () => {
    expect(fixRequest([{ kind: "syntax", text: "bad" }, { kind: "missing", text: "gone" }], "add a menu")).toMatch(/add a menu[\s\S]*1\. bad\n2\. gone/);
  });
});

describe("Build chat checks and fixes its own edits", () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView ??= () => {};
  });
  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.restoreAllMocks();
  });
  it("sends the problems back to the model and applies the fix", async () => {
    const { Chat } = await import("@/components/studio/Chat");
    const { workspace } = await import("@/lib/workspace");
    const { connectors } = await import("@/lib/connectors");
    workspace._reset();
    vi.spyOn(connectors, "isEnabled").mockReturnValue(true);
    const asks: string[] = [];
    const answer = (files: Record<string, string>) =>
      new Response(JSON.stringify({ message: { content: JSON.stringify({ files, message: "Done" }) } }));
    vi.spyOn(globalThis, "fetch").mockImplementation(async (u, init) => {
      if (String(u).endsWith("/api/tags")) return new Response(JSON.stringify({ models: [] }));
      const body = JSON.parse(String(init?.body));
      const user = body.messages.at(-1).content as string;
      asks.push(user);
      return asks.length === 1
        ? answer({ "app.js": "document.getElementById('missing').onclick=()=>{}" })
        : answer({ "app.js": "console.log('fixed')" });
    });
    render(<Chat />);
    await act(async () => {});
    fireEvent.change(screen.getByLabelText("Message OG BOT"), { target: { value: "add a button" } });
    await act(async () => {
      fireEvent.keyDown(screen.getByLabelText("Message OG BOT"), { key: "Enter" });
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(asks.length).toBe(2);
    expect(asks[1]).toMatch(/app\.js uses #missing/);
    expect(workspace.get().files["app.js"]).toBe("console.log('fixed')");
    expect(await screen.findByText(/Checked: the site runs with no errors/)).toBeInTheDocument();
  });
});
