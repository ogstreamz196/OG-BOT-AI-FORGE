import { afterEach, describe, expect, it, vi } from "vitest";
import { generateEdit, readChatStream } from "@/lib/local-ai";

afterEach(() => vi.restoreAllMocks());

const ndjson = (parts: string[], tail: Record<string, unknown> = {}) =>
  new Response(
    new ReadableStream({
      start(c) {
        const enc = new TextEncoder();
        parts.forEach((p) => c.enqueue(enc.encode(JSON.stringify({ message: { content: p } }) + "\n")));
        c.enqueue(enc.encode(JSON.stringify({ done: true, eval_count: 50, eval_duration: 1e9, ...tail }) + "\n"));
        c.close();
      },
    }),
  );

describe("streamed edits", () => {
  it("joins the stream and reports progress", async () => {
    const seen: { chars: number; tokPerSec: number | null }[] = [];
    const text = await readChatStream(ndjson(["Hel", "lo"]), (p) => seen.push(p));
    expect(text).toBe("Hello");
    expect(seen.at(-1)).toEqual({ chars: 5, tokPerSec: 50 });
  });

  it("asks for a stream, sends files compactly, and still returns a parsed edit", async () => {
    let body = "";
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_u, init) => {
      body = String(init?.body);
      return ndjson(['{"files": {"index.html": "<h1>x</h1>"},', ' "message": "Done"}']);
    });
    const progress = vi.fn();
    const edit = await generateEdit("http://x", "m", "change", { "index.html": "<p>a</p>" }, { onProgress: progress });
    expect(JSON.parse(body).stream).toBe(true);
    expect(JSON.parse(body).messages[1].content).toContain('{"index.html":"<p>a</p>"}');
    expect(edit).toEqual({ files: { "index.html": "<h1>x</h1>" }, message: "Done" });
    expect(progress).toHaveBeenCalled();
  });
});
