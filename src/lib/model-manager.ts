import { useSyncExternalStore } from "react";
import { connectors } from "./connectors";
import { models } from "./models";
import { overLimit } from "./orchestrator";

/**
 * Install / remove Ollama models on the drive from any device. Goes through the Ollama
 * connector, which the drive routes (plugged in here, or remote through the tunnel); the drive
 * server also refuses anything over 14B.
 */
export type Job = { tag: string; status: string; pct: number | null; error?: string };

let jobs: Record<string, Job> = {};
const listeners = new Set<() => void>();
const emit = () => {
  jobs = { ...jobs };
  listeners.forEach((l) => l());
};

export const ollamaBase = () =>
  (connectors.configOf("ollama")["baseUrl"] || "http://127.0.0.1:11434").replace(/\/+$/, "");

/** Same tag ignoring the implicit ":latest". */
export const sameTag = (a: string, b: string) => {
  const n = (t: string) => (t.includes(":") ? t : `${t}:latest`);
  return n(a) === n(b);
};

/** Re-read what's installed and share it with the rest of the app. */
export async function refreshInstalled(): Promise<string[] | null> {
  try {
    const r = await fetch(`${ollamaBase()}/api/tags`);
    if (!r.ok) return null;
    const names = (((await r.json()) as { models?: { name: string }[] }).models ?? []).map((m) => m.name);
    models.syncLive(names);
    return names;
  } catch {
    return null;
  }
}

/** Parse one line of Ollama's streamed pull progress. */
export function parsePullLine(line: string): { status: string; pct: number | null; error?: string } | null {
  try {
    const j = JSON.parse(line) as { status?: string; total?: number; completed?: number; error?: string };
    if (j.error) return { status: "failed", pct: null, error: j.error };
    const pct = j.total && j.completed != null ? Math.min(100, Math.round((j.completed / j.total) * 100)) : null;
    return { status: j.status ?? "working", pct };
  } catch {
    return null;
  }
}

export async function pullModel(tag: string): Promise<boolean> {
  if (overLimit(tag)) {
    jobs[tag] = { tag, status: "failed", pct: null, error: "Over the 14B limit" };
    emit();
    return false;
  }
  jobs[tag] = { tag, status: "starting", pct: 0 };
  emit();
  try {
    const r = await fetch(`${ollamaBase()}/api/pull`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: tag, stream: true }),
    });
    if (!r.ok || !r.body) {
      const msg = await r.text().catch(() => "");
      throw new Error(msg.slice(0, 160) || `engine answered ${r.status}`);
    }
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        const p = parsePullLine(line);
        if (!p) continue;
        if (p.error) throw new Error(p.error);
        jobs[tag] = { tag, status: p.status, pct: p.pct ?? jobs[tag]?.pct ?? null };
        emit();
      }
    }
    delete jobs[tag];
    emit();
    await refreshInstalled();
    return true;
  } catch (e) {
    jobs[tag] = { tag, status: "failed", pct: null, error: e instanceof Error ? e.message : String(e) };
    emit();
    return false;
  }
}

export async function removeModel(tag: string): Promise<boolean> {
  jobs[tag] = { tag, status: "removing", pct: null };
  emit();
  try {
    const r = await fetch(`${ollamaBase()}/api/delete`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: tag }),
    });
    if (!r.ok) throw new Error(`engine answered ${r.status}`);
    delete jobs[tag];
    emit();
    await refreshInstalled();
    return true;
  } catch (e) {
    jobs[tag] = { tag, status: "failed", pct: null, error: e instanceof Error ? e.message : String(e) };
    emit();
    return false;
  }
}

export const modelJobs = {
  get: () => jobs,
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  clear(tag: string) {
    delete jobs[tag];
    emit();
  },
};

const NONE: Record<string, Job> = {};
export function useModelJobs() {
  return useSyncExternalStore(modelJobs.subscribe, modelJobs.get, () => NONE);
}
