import { useSyncExternalStore } from "react";
import { supabase } from "./supabase";

/**
 * Usage ledger: activity counts (prompts, edits, image generations, music renders,
 * mobile builds). This device's counts live in localStorage; each new count is also
 * ADDED to the shared Supabase `usage_ledger` row (read-add-write, retried when
 * offline), so every device adds up instead of overwriting each other.
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

/** Counts from every device together (the shared `usage_ledger` row), once read. */
let remote: Usage | null = null;
/** This device's increments not yet added to the shared row. */
let pending: Partial<Record<UsageKey, number>> = {};
let pushTimer: ReturnType<typeof setTimeout> | null = null;

const rowToUsage = (r: Record<string, number | string>): Usage => ({
  prompts: Number(r["prompts"]) || 0,
  edits: Number(r["edits"]) || 0,
  images: Number(r["images"]) || 0,
  music: Number(r["music"]) || 0,
  builds: Number(r["builds"]) || 0,
  since: (r["since"] as string) || TODAY,
});

/** Add this device's new counts to the shared row (read, add, write), so devices add up. */
async function flushPending() {
  if (!supabase || !Object.keys(pending).length) return;
  const delta = pending;
  pending = {};
  try {
    const { data, error } = await supabase.from("usage_ledger").select("*").eq("id", ROW_ID).maybeSingle();
    if (error) throw error;
    const cur = data ? rowToUsage(data as Record<string, number | string>) : empty();
    const next: Usage = { ...cur };
    for (const [k, n] of Object.entries(delta) as [UsageKey, number][]) next[k] = (next[k] ?? 0) + n;
    const res = await supabase.from("usage_ledger").upsert({ id: ROW_ID, ...next });
    if (res.error) throw res.error;
    remote = next;
    notify();
  } catch {
    // Not signed in / offline: keep the increments for next time.
    for (const [k, n] of Object.entries(delta) as [UsageKey, number][]) pending[k] = (pending[k] ?? 0) + n;
  }
}
function schedulePush() {
  if (!supabase) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => void flushPending(), 800);
}

async function pullRemote() {
  if (!supabase) return;
  try {
    const { data } = await supabase.from("usage_ledger").select("*").eq("id", ROW_ID).maybeSingle();
    if (data) {
      remote = rowToUsage(data as Record<string, number | string>);
      notify();
    }
  } catch {
    /* offline or not allowed */
  }
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
  void pullRemote();
}

export const usage = {
  get: () => state,
  /** Every device's counts together, or null until read (needs D.EV sign-in). */
  all: () => remote,
  subscribe(l: () => void) {
    hydrateOnce();
    listeners.add(l);
    return () => listeners.delete(l);
  },
  record(key: UsageKey, n = 1) {
    state = { ...state, [key]: (state[key] ?? 0) + n };
    pending[key] = (pending[key] ?? 0) + n;
    persist();
    schedulePush();
    notify();
  },
  total: () => USAGE_META.reduce((sum, m) => sum + (state[m.key] ?? 0), 0),
  /** Reset this device's counts (the all-devices total keeps its history). */
  reset() {
    state = empty();
    persist();
    notify();
  },
  refresh: pullRemote,
};

export function useUsage() {
  return useSyncExternalStore(usage.subscribe, usage.get, () => SERVER_SNAPSHOT);
}
const NO_REMOTE = null;
/** Every device's counts (null until read). */
export function useUsageAll() {
  return useSyncExternalStore(usage.subscribe, usage.all, () => NO_REMOTE);
}
