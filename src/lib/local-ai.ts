import type { Files } from "./workspace";

/**
 * Local AI bridge: talks to the user's own Ollama server (http://localhost:11434
 * by default) from the browser. Works offline because the request never leaves
 * the machine. All functions degrade gracefully — the caller falls back to the
 * offline rule engine when no engine is reachable.
 */

export type EngineStatus = { ok: boolean; models: string[]; message: string };

export async function pingOllama(baseUrl: string): Promise<EngineStatus> {
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/tags`, { method: "GET" });
    if (!res.ok) return { ok: false, models: [], message: `HTTP ${res.status}` };
    const data = (await res.json()) as { models?: { name: string }[] };
    return { ok: true, models: (data.models ?? []).map((m) => m.name), message: "connected" };
  } catch (e) {
    return { ok: false, models: [], message: e instanceof Error ? e.message : "unreachable" };
  }
}

export type ModelEdit = { files: Files; message: string };

export const SYSTEM_PROMPT = `You are OG-BOT, an offline web app builder. You edit a tiny static web project made of these files: index.html (an HTML fragment or full document), styles.css, and app.js.
Apply the user's requested change and respond with ONLY a JSON object, no prose, no markdown fences:
{"files": {"<filename>": "<full new file contents>"}, "message": "<one short sentence>"}
Include ONLY the files you changed, with their COMPLETE new contents. Keep it a single self-contained web app. Do not add build tools or frameworks.`;

/** Parse a model response into a file edit. Tolerant of code fences and prose. Pure + tested. */
export function parseModelEdit(text: string): ModelEdit | null {
  if (!text) return null;
  // Strip ```json fences if present.
  let body = text.trim();
  const fence = body.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) body = fence[1]!.trim();
  // Find the first balanced-looking JSON object.
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(body.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as { files?: unknown; message?: unknown };
  if (!obj.files || typeof obj.files !== "object") return null;
  const files: Files = {};
  for (const [k, v] of Object.entries(obj.files as Record<string, unknown>)) {
    if (typeof v === "string") files[k] = v;
  }
  if (Object.keys(files).length === 0) return null;
  return { files, message: typeof obj.message === "string" ? obj.message : "Applied changes." };
}

/** Read Ollama's streamed /api/chat answer (ndjson), or a plain JSON answer, into text. */
export async function readChatStream(
  res: Response,
  onProgress?: (p: { chars: number; tokPerSec: number | null }) => void,
): Promise<string> {
  if (!res.body) {
    const data = (await res.json()) as { message?: { content?: string } };
    return data.message?.content ?? "";
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let text = "";
  let tokens = 0;
  let firstAt = 0;
  const take = (line: string) => {
    const t = line.trim();
    if (!t) return;
    try {
      const j = JSON.parse(t) as {
        message?: { content?: string };
        done?: boolean;
        eval_count?: number;
        eval_duration?: number;
      };
      const piece = j.message?.content ?? "";
      if (piece) {
        if (!firstAt) firstAt = Date.now();
        text += piece;
        tokens++;
      }
      const tps =
        j.done && j.eval_count && j.eval_duration
          ? Math.round((j.eval_count / j.eval_duration) * 1e9)
          : firstAt && Date.now() - firstAt > 300
            ? Math.round((tokens * 1000) / (Date.now() - firstAt))
            : null;
      onProgress?.({ chars: text.length, tokPerSec: tps });
    } catch {
      /* partial line */
    }
  };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    lines.forEach(take);
  }
  take(buf);
  return text;
}

/** A quick non-streaming completion — used for the orchestrator's reasoning step. */
export async function quickChat(
  baseUrl: string,
  model: string,
  prompt: string,
  system?: string,
  signal?: AbortSignal,
): Promise<string> {
  const messages = [
    ...(system ? [{ role: "system", content: system }] : []),
    { role: "user", content: prompt },
  ];
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      stream: false,
      // keep_alive holds the model in VRAM between messages (no slow reload);
      // num_predict caps the short helper outputs (routing/reasoning) so they return fast.
      keep_alive: "24h",
      options: { temperature: 0.3, num_predict: 400 },
      messages,
    }),
    ...(signal ? { signal } : {}),
  });
  if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
  const data = (await res.json()) as { message?: { content?: string } };
  return data.message?.content ?? "";
}

/**
 * Ask the local model to edit the project. `opts.context` (e.g. a reasoning
 * model's plan) is prepended, and `opts.system` overrides the system prompt so
 * the AI's own tuned logic can be used. Throws on network/engine failure.
 */
export async function generateEdit(
  baseUrl: string,
  model: string,
  request: string,
  files: Files,
  opts?: {
    context?: string;
    system?: string;
    signal?: AbortSignal;
    /** Called as the answer streams in (characters so far, tokens per second once known). */
    onProgress?: (p: { chars: number; tokPerSec: number | null }) => void;
  },
): Promise<ModelEdit> {
  const context = opts?.context ? `Approach to follow:\n${opts.context}\n\n` : "";
  // Compact JSON: the same files in fewer tokens, so the model reads them faster.
  const prompt = `${context}Current files:\n${JSON.stringify(files)}\n\nRequested change: ${request}`;
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      stream: true, // stream so the chat can show progress while it writes
      keep_alive: "24h", // keep the model warm in VRAM between edits
      options: { temperature: 0.2, num_predict: 2048 },
      messages: [
        { role: "system", content: opts?.system || SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
    }),
    ...(opts?.signal ? { signal: opts.signal } : {}),
  });
  if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
  const content = await readChatStream(res, opts?.onProgress);
  const edit = parseModelEdit(content);
  if (!edit) throw new Error("Model returned an unparseable response");
  return edit;
}

/** Ask a vision model (e.g. llama3.2-vision:11b) to describe a screenshot as a design brief. */
export async function describeImage(
  baseUrl: string,
  model: string,
  base64: string,
  signal?: AbortSignal,
): Promise<string> {
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      stream: false,
      keep_alive: "24h",
      options: { temperature: 0.2, num_predict: 500 },
      messages: [
        {
          role: "user",
          content:
            "Describe this web page screenshot as a design brief for a developer: layout (top to bottom), colours (hex if you can), fonts, sections and their content. Under 150 words, plain bullet points.",
          images: [base64],
        },
      ],
    }),
    ...(signal ? { signal } : {}),
  });
  if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
  const data = (await res.json()) as { message?: { content?: string } };
  return data.message?.content ?? "";
}
