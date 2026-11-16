import { useSyncExternalStore } from "react";
import type { GenOpts } from "./image-gen";
import { connectors } from "./connectors";
import { driveLink } from "./drive-link";

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
  /** ComfyUI file reference, so the image loads from any device (local or remote). */
  img?: { filename: string; subfolder: string; type: string };
};

/** Where to load a creation from right now (follows the drive: local or through the tunnel). */
export function creationUrl(c: Creation): string {
  if (!c.img) return c.url;
  const base = (connectors.configOf("comfyui")["baseUrl"] || "http://127.0.0.1:8188").replace(/\/+$/, "");
  const p = new URLSearchParams({ filename: c.img.filename, subfolder: c.img.subfolder, type: c.img.type });
  return `${base}/view?${p}`;
}

const driveBase = () => {
  const l = driveLink.get();
  return (l.mode === "local" || l.mode === "remote") && l.base ? l.base : null;
};
/** Mirror a change to the drive's shared gallery (best effort; the local copy always works). */
function toDrive(body: Record<string, unknown>) {
  const base = driveBase();
  if (!base) return;
  void fetch(`${base}/og/gallery`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => {});
}

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
    toDrive({ add: made });
  },
  remove(id: string) {
    set(state.filter((c) => c.id !== id));
    toDrive({ remove: [id] });
  },
  clear() {
    set([]);
    toDrive({ clear: true });
  },
  /** Pull the drive's gallery (made on any device) and merge it in, newest first. */
  async syncFromDrive(): Promise<number> {
    const base = driveBase();
    if (!base) return 0;
    try {
      const r = await fetch(`${base}/og/gallery`);
      if (!r.ok) return 0;
      const items = ((await r.json()) as { items?: Creation[] }).items ?? [];
      const known = new Set(state.map((c) => c.id));
      const fresh = items.filter((c) => c && c.id && !known.has(c.id));
      if (fresh.length) set([...fresh, ...state].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)));
      // Send up anything only this device has.
      const onDrive = new Set(items.map((c) => c.id));
      const mine = state.filter((c) => !onDrive.has(c.id));
      if (mine.length) toDrive({ add: mine });
      return fresh.length;
    } catch {
      return 0;
    }
  },
  count: () => state.length,
};

export function useGallery() {
  return useSyncExternalStore(gallery.subscribe, gallery.get, () => SERVER_SNAPSHOT);
}
