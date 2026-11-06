import { useSyncExternalStore } from "react";

/**
 * Local AI model catalog + status. The studio ships with no weights — the user
 * downloads models later into a local inference engine (Ollama / llama.cpp /
 * ComfyUI). This store tracks which models the user has marked installed and
 * which is the active one, so the chat can target it. Persisted to localStorage.
 */

export type ModelRole = "coder" | "reasoning" | "image" | "music";

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
  {
    id: "qwen2.5-coder-7b",
    name: "Qwen 2.5 Coder 7B",
    role: "coder",
    size: 4.7,
    vram: 5,
    pull: "qwen2.5-coder:7b",
  },
  {
    id: "qwen2.5-coder-14b",
    name: "Qwen 2.5 Coder 14B",
    role: "coder",
    size: 9,
    vram: 8,
    pull: "qwen2.5-coder:14b",
  },
  {
    id: "deepseek-r1-14b",
    name: "DeepSeek R1 14B (reasoning)",
    role: "reasoning",
    size: 9,
    vram: 8,
    pull: "deepseek-r1:14b",
  },
  {
    id: "qwen2.5-coder-1.5b",
    name: "Qwen 2.5 Coder 1.5B (autocomplete)",
    role: "coder",
    size: 1,
    vram: 1.5,
    pull: "qwen2.5-coder:1.5b",
  },
  {
    id: "sdxl-turbo",
    name: "SDXL Turbo (image)",
    role: "image",
    size: 7,
    vram: 8,
    pull: "sdxl-turbo",
  },
  {
    id: "musicgen-small",
    name: "MusicGen Small (audio)",
    role: "music",
    size: 2,
    vram: 4,
    pull: "musicgen-small",
  },
];

export const ROLE_LABEL: Record<ModelRole, string> = {
  coder: "Coding",
  reasoning: "Reasoning",
  image: "Image",
  music: "Music",
};

export type ModelStatus = "available" | "installed";

type State = {
  /** id -> status. Absent means "available" (not installed). */
  installed: Record<string, ModelStatus>;
  /** active coder/reasoning model id driving the chat, or null. */
  active: string | null;
};

const STORAGE_KEY = "og-models-v1";

function load(): State {
  const base: State = { installed: {}, active: null };
  if (typeof localStorage === "undefined") return base;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...base, ...(JSON.parse(raw) as Partial<State>) } : base;
  } catch {
    return base;
  }
}

let state: State = load();
const SERVER_SNAPSHOT: State = { installed: {}, active: null };
const listeners = new Set<() => void>();
let hydrated = false;

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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
  _reset() {
    state = { installed: {}, active: null };
    persist();
    notify();
  },
};

export function useModels() {
  return useSyncExternalStore(models.subscribe, models.get, () => SERVER_SNAPSHOT);
}
