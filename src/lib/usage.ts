import { useSyncExternalStore } from "react";

/**
 * Local usage ledger: privately tracks activity counts on the device
 * (prompts, edits, image generations, music renders, mobile builds) so they
 * can be reviewed at renewal. Persisted to localStorage; never leaves the
 * machine. Mirrors the offline-first "Local Usage Ledger" from the plan.
 */

export type UsageKey = "prompts" | "edits" | "images" | "music" | "builds";

export const USAGE_META: { key: UsageKey; label: string }[] = [
  { key: "prompts", label: "Agent prompts" },
  { key: "edits", label: "Code edits" },
  { key: "images", label: "Images generated" },
  { key: "music", label: "Tracks rendered" },
  { key: "builds", label: "Mobile builds" },
];

export type Usage = Record<UsageKey, number> & { since: string };

const STORAGE_KEY = "og-usage-v1";

function empty(): Usage {
  return {
    prompts: 0,
    edits: 0,
    images: 0,
    music: 0,
    builds: 0,
    since: new Date().toISOString().slice(0, 10),
  };
}

function load(): Usage {
  const base = empty();
  if (typeof localStorage === "undefined") return base;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...base, ...(JSON.parse(raw) as Partial<Usage>) } : base;
  } catch {
    return base;
  }
}

let state: Usage = load();
const listeners = new Set<() => void>();

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

export const usage = {
  get: () => state,
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  record(key: UsageKey, n = 1) {
    state = { ...state, [key]: (state[key] ?? 0) + n };
    persist();
    listeners.forEach((l) => l());
  },
  total: () => USAGE_META.reduce((sum, m) => sum + (state[m.key] ?? 0), 0),
  reset() {
    state = empty();
    persist();
    listeners.forEach((l) => l());
  },
};

export function useUsage() {
  return useSyncExternalStore(usage.subscribe, usage.get, usage.get);
}
