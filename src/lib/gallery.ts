import { useSyncExternalStore } from "react";
import type { GenOpts } from "./image-gen";

/**
 * Persistent Creations gallery. Generated images (and later video exports) are
 * saved here so they survive navigating between tools and reopening the app.
 * Stored in localStorage, capped so it never grows unbounded. URLs reference the
 * local engine (ComfyUI /view); they resolve while that engine is running.
 */

export type Creation = {
  id: string;
  kind: "image" | "video";
  prompt: string;
  url: string;
  seed: number;
  createdAt: number;
  /** Generation options, so "vary" / "reuse seed" work after a reload. */
  opts?: GenOpts;
};

const STORAGE_KEY = "og-gallery-v1";
const MAX = 60;

function load(): Creation[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as Creation[]) : [];
  } catch {
    return [];
  }
}

let state: Creation[] = [];
const SERVER_SNAPSHOT: Creation[] = [];
const listeners = new Set<() => void>();
let hydrated = false;

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore quota / unavailable */
  }
}
function notify() {
  listeners.forEach((l) => l());
}
function set(next: Creation[]) {
  state = next.slice(0, MAX);
  persist();
  notify();
}

export const gallery = {
  get: () => state,
  subscribe(l: () => void) {
    if (!hydrated && typeof window !== "undefined") {
      hydrated = true;
      const next = load();
      if (next.length) {
        state = next.slice(0, MAX);
        notify();
      }
    }
    listeners.add(l);
    return () => listeners.delete(l);
  },
  /** Prepend one or more creations (newest first). */
  add(items: Omit<Creation, "id" | "createdAt">[]) {
    const now = Date.now();
    const made: Creation[] = items.map((it, i) => ({
      ...it,
      id: `${now}-${i}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: now,
    }));
    set([...made, ...state]);
  },
  remove(id: string) {
    set(state.filter((c) => c.id !== id));
  },
  clear() {
    set([]);
  },
  count: () => state.length,
};

export function useGallery() {
  return useSyncExternalStore(gallery.subscribe, gallery.get, () => SERVER_SNAPSHOT);
}
