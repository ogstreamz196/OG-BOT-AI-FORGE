import { useSyncExternalStore } from "react";
import { pickModel } from "./orchestrator";

/**
 * Local AI model catalog + status. The studio ships with no weights — the user
 * downloads models later into a local inference engine (Ollama / llama.cpp /
 * ComfyUI). This store tracks which models the user has marked installed and
 * which is the active one, so the chat can target it. Persisted to localStorage.
 */

export type ModelRole = "coder" | "reasoning" | "chat" | "json" | "vision" | "embed" | "image" | "music";

export type ModelDef = {
  id: string;
  name: string;
  role: ModelRole;
  /** Approx download size, GB. */
  size: number;
  /** Approx VRAM to run, GB. */
  vram: number;
  /** Ollama/registry pull tag, for when a local engine is connected. */
  pull: string;
};

export const MODEL_CATALOG: ModelDef[] = [
  { id: "qwen2.5-coder-14b", name: "Qwen 2.5 Coder 14B · lead coder (docked)", role: "coder", size: 9, vram: 10.5, pull: "qwen2.5-coder:14b" },
  { id: "qwen2.5-coder-7b", name: "Qwen 2.5 Coder 7B · handheld / low power", role: "coder", size: 4.7, vram: 6, pull: "qwen2.5-coder:7b" },
  { id: "qwen2.5-14b", name: "Qwen 2.5 14B · cinematic director & lyrics", role: "chat", size: 9, vram: 10.5, pull: "qwen2.5:14b" },
  { id: "qwen2.5-7b", name: "Qwen 2.5 7B · director (low power)", role: "chat", size: 4.7, vram: 6, pull: "qwen2.5:7b" },
  { id: "deepseek-r1-14b", name: "DeepSeek R1 14B · extended reasoning", role: "reasoning", size: 9, vram: 10.5, pull: "deepseek-r1:14b" },
  { id: "deepseek-r1-8b", name: "DeepSeek R1 8B · reasoning (low power)", role: "reasoning", size: 4.9, vram: 6.5, pull: "deepseek-r1:8b" },
  { id: "phi4-14b", name: "Phi-4 14B · math & algorithms", role: "reasoning", size: 9.1, vram: 10.5, pull: "phi4:14b" },
  { id: "dolphin3-8b", name: "Dolphin 3 8B · zero-refusal lyrics", role: "chat", size: 4.9, vram: 6.5, pull: "dolphin3:8b" },
  { id: "mistral-nemo-12b", name: "Mistral Nemo 12B · strict JSON", role: "json", size: 7.1, vram: 9, pull: "mistral-nemo:12b" },
  { id: "hermes3-8b", name: "Hermes 3 8B · strict JSON (low power)", role: "json", size: 4.7, vram: 6, pull: "hermes3:8b" },
  { id: "llama3.2-vision-11b", name: "Llama 3.2 Vision 11B · visual consistency", role: "vision", size: 7.8, vram: 9.5, pull: "llama3.2-vision:11b" },
  { id: "llama3.2-3b", name: "Llama 3.2 3B · instant testing", role: "chat", size: 2, vram: 3.5, pull: "llama3.2:3b" },
  { id: "llama3.2-1b", name: "Llama 3.2 1B · lowest-overhead fallback", role: "chat", size: 1.3, vram: 3, pull: "llama3.2:1b" },
  { id: "nomic-embed-text", name: "Nomic Embed Text · offline semantic search", role: "embed", size: 0.3, vram: 1, pull: "nomic-embed-text:latest" },
  { id: "sdxl-turbo", name: "SDXL Turbo (image, ComfyUI)", role: "image", size: 7, vram: 8, pull: "sdxl-turbo" },
  { id: "musicgen-small", name: "MusicGen Small (audio)", role: "music", size: 2, vram: 4, pull: "musicgen-small" },
];

export const ROLE_LABEL: Record<ModelRole, string> = {
  coder: "Coding",
  reasoning: "Reasoning",
  chat: "Writing & chat",
  json: "Strict JSON",
  vision: "Vision",
  embed: "Embeddings",
  image: "Image",
  music: "Music",
};

export type ModelStatus = "available" | "installed";

type State = {
  /** id -> status. Absent means "available" (not installed). */
  installed: Record<string, ModelStatus>;
  /** active model driving the chat: a catalog id OR a raw Ollama tag, or null. */
  active: string | null;
  /** Raw model tags actually installed on the connected Ollama server (live truth). */
  live: string[];
};

const STORAGE_KEY = "og-models-v1";

function load(): State {
  const base: State = { installed: {}, active: null, live: [] };
  if (typeof localStorage === "undefined") return base;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    // `live` is runtime truth from the engine; never restore a stale list.
    return raw ? { ...base, ...(JSON.parse(raw) as Partial<State>), live: [] } : base;
  } catch {
    return base;
  }
}

let state: State = load();
const SERVER_SNAPSHOT: State = { installed: {}, active: null, live: [] };
const listeners = new Set<() => void>();
let hydrated = false;

function persist() {
  try {
    // Don't persist `live` — it is re-synced from the engine on connect.
    const { installed, active } = state;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ installed, active }));
  } catch {
    /* ignore */
  }
}
function notify() {
  listeners.forEach((l) => l());
}
function set(patch: Partial<State>) {
  state = { ...state, ...patch };
  persist();
  notify();
}

export const models = {
  get: () => state,
  subscribe(l: () => void) {
    if (!hydrated && typeof window !== "undefined") {
      hydrated = true;
      const next = load();
      if (JSON.stringify(next) !== JSON.stringify(state)) {
        state = next;
        notify();
      }
    }
    listeners.add(l);
    return () => listeners.delete(l);
  },
  statusOf: (id: string): ModelStatus => state.installed[id] ?? "available",
  install(id: string) {
    const def = MODEL_CATALOG.find((m) => m.id === id);
    set({
      installed: { ...state.installed, [id]: "installed" },
      // Auto-activate the first installed coder/reasoning model.
      active:
        state.active ??
        (def && (def.role === "coder" || def.role === "reasoning") ? id : state.active),
    });
  },
  uninstall(id: string) {
    const next = { ...state.installed };
    delete next[id];
    set({ installed: next, active: state.active === id ? null : state.active });
  },
  setActive: (id: string | null) => set({ active: id }),
  activeDef: (): ModelDef | null => MODEL_CATALOG.find((m) => m.id === state.active) ?? null,
  installedCount: () => Object.values(state.installed).filter((s) => s === "installed").length,

  /** Live Ollama tags currently installed on the connected engine. */
  live: () => state.live,
  liveCount: () => state.live.length,
  /**
   * Record the real model list from the engine (/api/tags). If the active model
   * is unset or no longer installed, auto-pick the best coding model so the chat
   * always targets something that actually exists. Idempotent/no-op if unchanged.
   */
  syncLive(names: string[]) {
    const sameList = names.length === state.live.length && names.every((n, i) => state.live[i] === n);
    const activeStillValid =
      state.active != null &&
      (names.includes(state.active) || MODEL_CATALOG.some((m) => m.id === state.active));
    const active = activeStillValid ? state.active : (pickModel("code", names) ?? state.active);
    if (sameList && active === state.active) return;
    set({ live: names, active });
  },
  /**
   * The raw tag to send to the engine for the active model: the live tag if the
   * active id is one, else the catalog pull tag, else the first live model.
   */
  activeTag(): string | null {
    const a = state.active;
    if (a && state.live.includes(a)) return a;
    const def = MODEL_CATALOG.find((m) => m.id === a);
    if (def) return def.pull;
    return state.live[0] ?? null;
  },
  _reset() {
    state = { installed: {}, active: null, live: [] };
    persist();
    notify();
  },
};

export function useModels() {
  return useSyncExternalStore(models.subscribe, models.get, () => SERVER_SNAPSHOT);
}
