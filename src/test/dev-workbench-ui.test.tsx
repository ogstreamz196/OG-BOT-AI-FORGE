import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DevWorkbench } from "@/components/studio/DevWorkbench";

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});

const streamOf = (chunks: string[]) => {
  const enc = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(c) {
        chunks.forEach((t) =>
          c.enqueue(enc.encode(JSON.stringify({ message: { content: t } }) + "\n")),
        );
        c.close();
      },
    }),
  );
};

describe("Dev Workbench", () => {
  it("defaults to qwen2.5-coder:14b and streams generated files into tabs", async () => {
    if (!document.createRange().getClientRects)
      (Range.prototype as unknown as { getClientRects: () => DOMRectList }).getClientRects = () =>
        [] as unknown as DOMRectList;
    const fetchMock = vi.fn(async (_u: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}"));
      expect(body.model).toBe("qwen2.5-coder:14b");
      return streamOf([
        "Files:\n### `index.html`\n```html\n<h1>Hi</h1>\n```\n",
        "### `schema.sql`\n```sql\ncreate table t();\n```",
      ]);
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal(
      "requestAnimationFrame",
      (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0) as unknown as number,
    );
    render(<DevWorkbench />);
    await act(async () => {});
    expect((screen.getByLabelText("Model") as HTMLSelectElement).value).toBe("qwen2.5-coder:14b");
    fireEvent.change(screen.getByLabelText("Prompt"), { target: { value: "make a page" } });
    fireEvent.keyDown(screen.getByLabelText("Prompt"), { key: "Enter", ctrlKey: true });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(screen.getByRole("button", { name: /index\.html/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /schema\.sql/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /generate batch script/i })).toBeEnabled();
  });
});

describe("Dev Workbench extras", () => {
  it("explains the mode, offers samples and saves to the drive", async () => {
    const { driveLink } = await import("@/lib/drive-link");
    vi.spyOn(driveLink, "get").mockReturnValue({ mode: "local", base: "http://127.0.0.1:11500", status: null, message: "" });
    const saved: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (u: string, init?: RequestInit) => {
        if (String(u).endsWith("/og/projects/save")) {
          saved.push(String(init?.body));
          return new Response(JSON.stringify({ ok: true, folder: "OFFLINE AI/projects/dev-project", written: ["index.html"] }));
        }
        return streamOf(["### `index.html`\n```html\n<h1>hi</h1>\n```\n"]);
      }),
    );
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0) as unknown as number);
    render(<DevWorkbench />);
    await act(async () => {});
    expect(screen.getByText(/Writes a whole app or feature/)).toBeInTheDocument();
    expect(screen.queryByText("Unrestricted Automation")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /A to-do app in plain HTML/ }));
    expect(screen.getByLabelText("Prompt")).toHaveValue("A to-do app in plain HTML, CSS and JS that saves to localStorage");
    fireEvent.keyDown(screen.getByLabelText("Prompt"), { key: "Enter", ctrlKey: true });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    fireEvent.click(screen.getByRole("button", { name: /Save to drive/ }));
    await act(async () => {});
    expect(saved[0]).toContain('"project":"dev-project"');
    expect(saved[0]).toContain("index.html");
    expect(await screen.findByText(/Saved 1 file\(s\) to OFFLINE AI\/projects\/dev-project/)).toBeInTheDocument();
  });
});
