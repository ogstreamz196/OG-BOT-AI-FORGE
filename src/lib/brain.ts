import { useSyncExternalStore } from "react";
import { SYSTEM_PROMPT } from "./local-ai";

/**
 * The AI's tunable "logic": the system prompt that drives the builder, plus
 * whether model chaining (reason→build) is allowed. Editing this is how the AI
 * (or the user) improves its own behaviour at runtime. Guarded by the
 * "self-tune" permission in the UI. Persisted to localStorage; always reversible.
 */

export type Brain = { systemPrompt: string; chain: boolean };

export const DEFAULT_BRAIN: Brain = { systemPrompt: SYSTEM_PROMPT, chain: false };

const STORAGE_KEY = "og-brain-v1";

function load(): Brain {
  if (typeof localStorage === "undefined") return { ...DEFAULT_BRAIN };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw
      ? { ...DEFAULT_BRAIN, ...(JSON.parse(raw) as Partial<Brain>) }
      : { ...DEFAULT_BRAIN };
  } catch {
    return { ...DEFAULT_BRAIN };
  }
}

const SERVER_SNAPSHOT: Brain = { ...DEFAULT_BRAIN };
let state: Brain = { ...DEFAULT_BRAIN };
const listeners = new Set<() => void>();
let hydrated = false;

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

export const brain = {
  get: () => state,
  subscribe(l: () => void) {
    if (!hydrated && typeof window !== "undefined") {
      hydrated = true;
      const next = load();
      if (JSON.stringify(next) !== JSON.stringify(state)) {
        state = next;
        listeners.forEach((x) => x());
      }
    }
    listeners.add(l);
    return () => listeners.delete(l);
  },
  set(patch: Partial<Brain>) {
    state = { ...state, ...patch };
    persist();
    listeners.forEach((l) => l());
  },
  reset() {
    state = { ...DEFAULT_BRAIN };
    persist();
    listeners.forEach((l) => l());
  },
};

export function useBrain() {
  return useSyncExternalStore(brain.subscribe, brain.get, () => SERVER_SNAPSHOT);
}
