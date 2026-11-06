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

const SYSTEM_PROMPT = `You are OG-BOT, an offline web app builder. You edit a tiny static web project made of these files: index.html (an HTML fragment or full document), styles.css, and app.js.
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

/** Ask the local model to edit the project. Throws on network/engine failure. */
export async function generateEdit(
  baseUrl: string,
  model: string,
  request: string,
  files: Files,
): Promise<ModelEdit> {
  const prompt = `Current files:\n${JSON.stringify(files, null, 2)}\n\nRequested change: ${request}`;
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      stream: false,
      options: { temperature: 0.2 },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
  const data = (await res.json()) as { message?: { content?: string } };
  const content = data.message?.content ?? "";
  const edit = parseModelEdit(content);
  if (!edit) throw new Error("Model returned an unparseable response");
  return edit;
}
