import { useSyncExternalStore } from "react";
import { supabase } from "./supabase";

/**
 * Usage ledger: tracks activity counts on the device (prompts, edits, image
 * generations, music renders, mobile builds). Offline-first — written to
 * localStorage immediately and pushed to the Supabase `usage_ledger` row
 * (debounced, best-effort), hydrating from both on mount. Mirrors the plan's
 * "Local Usage Ledger".
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
const ROW_ID = "primary";
const TODAY = new Date().toISOString().slice(0, 10);

function empty(): Usage {
  return { prompts: 0, edits: 0, images: 0, music: 0, builds: 0, since: TODAY };
}

const SERVER_SNAPSHOT: Usage = empty();
let state: Usage = empty();
const listeners = new Set<() => void>();
let hydrated = false;

function notify() {
  listeners.forEach((l) => l());
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

let pushTimer: ReturnType<typeof setTimeout> | null = null;
function pushRemote() {
  if (!supabase) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    void supabase!
      .from("usage_ledger")
      .upsert({ id: ROW_ID, ...state })
      .then(
        () => {},
        () => {},
      );
  }, 400);
}

function hydrateOnce() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      state = { ...state, ...(JSON.parse(raw) as Partial<Usage>) };
      notify();
    }
  } catch {
    /* ignore */
  }
  if (supabase) {
    void supabase
      .from("usage_ledger")
      .select("*")
      .eq("id", ROW_ID)
      .maybeSingle()
      .then(
        ({ data }) => {
          if (data) {
            const r = data as Record<string, number | string>;
            state = {
              prompts: Number(r["prompts"]) || 0,
              edits: Number(r["edits"]) || 0,
              images: Number(r["images"]) || 0,
              music: Number(r["music"]) || 0,
              builds: Number(r["builds"]) || 0,
              since: (r["since"] as string) || TODAY,
            };
            persist();
            notify();
          } else {
            pushRemote();
          }
        },
        () => {},
      );
  }
}

export const usage = {
  get: () => state,
  subscribe(l: () => void) {
    hydrateOnce();
    listeners.add(l);
    return () => listeners.delete(l);
  },
  record(key: UsageKey, n = 1) {
    state = { ...state, [key]: (state[key] ?? 0) + n };
    persist();
    pushRemote();
    notify();
  },
  total: () => USAGE_META.reduce((sum, m) => sum + (state[m.key] ?? 0), 0),
  reset() {
    state = empty();
    persist();
    pushRemote();
    notify();
  },
};

export function useUsage() {
  return useSyncExternalStore(usage.subscribe, usage.get, () => SERVER_SNAPSHOT);
}
