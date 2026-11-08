// Talks to a local Ollama server (https://ollama.com) straight from the browser.
// Nothing leaves the user's machine: requests go to their own Ollama install.

export const DEFAULT_OLLAMA_URL = "http://localhost:11434";

export type ModelKind = "chat" | "code" | "reasoning" | "vision" | "embed";
/** gb = approximate download size / video memory used by the default (Q4) build. */
export type ModelInfo = { tag: string; label: string; kind: ModelKind; gb: number };

/** Supported models, in menu order. The first one is the default. */
export const OLLAMA_MODELS: ModelInfo[] = [
  { tag: "qwen2.5-coder:14b", label: "Qwen 2.5 Coder 14B", kind: "code", gb: 9.0 },
  { tag: "qwen2.5-coder:7b", label: "Qwen 2.5 Coder 7B", kind: "code", gb: 4.7 },
  { tag: "qwen2.5:14b", label: "Qwen 2.5 14B", kind: "chat", gb: 9.0 },
  { tag: "deepseek-r1:14b", label: "DeepSeek R1 14B", kind: "reasoning", gb: 9.0 },
  { tag: "llama3.1:8b", label: "Llama 3.1 8B", kind: "chat", gb: 4.9 },
  { tag: "llama3.2:3b", label: "Llama 3.2 3B", kind: "chat", gb: 2.0 },
  { tag: "llama3.2:1b", label: "Llama 3.2 1B", kind: "chat", gb: 1.3 },
  { tag: "dolphin3:8b", label: "Dolphin 3 8B", kind: "chat", gb: 4.9 },
  { tag: "dolphin-mistral", label: "Dolphin Mistral 7B", kind: "chat", gb: 4.1 },
  { tag: "hermes3:8b", label: "Hermes 3 8B", kind: "chat", gb: 4.7 },
  { tag: "minicpm-v", label: "MiniCPM-V", kind: "vision", gb: 5.5 },
  { tag: "llama3.2-vision:11b", label: "Llama 3.2 Vision 11B", kind: "vision", gb: 7.8 },
  { tag: "nomic-embed-text", label: "Nomic Embed Text", kind: "embed", gb: 0.3 },
];

export const DEFAULT_MODEL = OLLAMA_MODELS[0]!.tag;

/** Chat-capable models (embedding models can't hold a conversation). */
export const CHAT_MODELS = OLLAMA_MODELS.filter((m) => m.kind !== "embed");

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

const clean = (url: string) => url.trim().replace(/\/+$/, "") || DEFAULT_OLLAMA_URL;

/** Ollama lists "dolphin-mistral" as "dolphin-mistral:latest"; treat them as the same. */
export function sameModel(a: string, b: string) {
  const norm = (t: string) => (t.includes(":") ? t : `${t}:latest`);
  return norm(a) === norm(b);
}

/** Tags of the models installed on the Ollama server. Throws if it can't be reached. */
export async function listInstalled(baseUrl: string, signal?: AbortSignal): Promise<string[]> {
  const res = await fetch(`${clean(baseUrl)}/api/tags`, { signal: signal ?? null });
  if (!res.ok) throw new Error(`Ollama answered ${res.status}`);
  const data = (await res.json()) as { models?: { name: string }[] };
  return (data.models ?? []).map((m) => m.name);
}

/**
 * Streams a chat reply. Calls onToken for each piece of text as it arrives.
 * Resolves with the full reply.
 */
export async function streamChat(opts: {
  baseUrl: string;
  model: string;
  messages: ChatMessage[];
  onToken: (text: string) => void;
  signal?: AbortSignal;
}): Promise<string> {
  const res = await fetch(`${clean(opts.baseUrl)}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // keep_alive keeps the model loaded in memory so follow-up replies start fast.
    body: JSON.stringify({ model: opts.model, messages: opts.messages, stream: true, keep_alive: "30m" }),
    signal: opts.signal ?? null,
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    let msg = text;
    try {
      msg = (JSON.parse(text) as { error?: string }).error ?? text;
    } catch {
      /* not JSON */
    }
    throw new Error(msg || `Ollama answered ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let full = "";
  const handle = (line: string) => {
    if (!line.trim()) return;
    const chunk = JSON.parse(line) as { message?: { content?: string }; error?: string };
    if (chunk.error) throw new Error(chunk.error);
    const piece = chunk.message?.content ?? "";
    if (piece) {
      full += piece;
      opts.onToken(piece);
    }
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const parts = buf.split("\n");
    buf = parts.pop() ?? "";
    parts.forEach(handle);
  }
  handle(buf);
  return full;
}
