import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_MODEL, listInstalled, sameModel, streamChat } from "@/lib/ollama";
import { buildContext } from "@/components/studio/Agent";

const ndjson = (chunks: string[]) =>
  new Response(new ReadableStream({
    start(c) { chunks.forEach((s) => c.enqueue(new TextEncoder().encode(s))); c.close(); },
  }));

afterEach(() => vi.unstubAllGlobals());

describe("ollama client", () => {
  it("defaults to qwen2.5-coder:14b", () => expect(DEFAULT_MODEL).toBe("qwen2.5-coder:14b"));

  it("treats bare tags as :latest", () => {
    expect(sameModel("dolphin-mistral:latest", "dolphin-mistral")).toBe(true);
    expect(sameModel("llama3.2:1b", "llama3.2:3b")).toBe(false);
  });

  it("lists installed models", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ models: [{ name: "qwen2.5-coder:14b" }] })));
    expect(await listInstalled("http://localhost:11434/")).toEqual(["qwen2.5-coder:14b"]);
    expect(vi.mocked(fetch).mock.calls[0]![0]).toBe("http://localhost:11434/api/tags");
  });

  it("streams tokens split across network chunks", async () => {
    const fetchMock = vi.fn(async () => ndjson([
      '{"message":{"content":"Hel"}}\n{"message":{"con',
      'tent":"lo"}}\n',
      '{"done":true}',
    ]));
    vi.stubGlobal("fetch", fetchMock);
    const got: string[] = [];
    const full = await streamChat({ baseUrl: "http://x", model: "qwen2.5-coder:14b", messages: [], onToken: (t) => got.push(t) });
    expect(full).toBe("Hello");
    expect(got).toEqual(["Hel", "lo"]);
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body).toMatchObject({ model: "qwen2.5-coder:14b", stream: true });
  });

  it("reports Ollama's error message", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "model 'x' not found" }, { status: 404 })));
    await expect(streamChat({ baseUrl: "http://x", model: "x", messages: [], onToken: () => {} })).rejects.toThrow("not found");
  });
});

describe("conversation context", () => {
  it("keeps real turns, drops slash commands and <think> blocks", () => {
    const ctx = buildContext([
      { t: "sys", s: "hi" },
      { t: "user", s: "/git-push" },
      { t: "agent", s: "Push complete." },
      { t: "user", s: "why?" },
      { t: "agent", s: "<think>hmm</think>Because.", ai: true },
    ]);
    expect(ctx).toEqual([{ role: "user", content: "why?" }, { role: "assistant", content: "Because." }]);
  });
});
