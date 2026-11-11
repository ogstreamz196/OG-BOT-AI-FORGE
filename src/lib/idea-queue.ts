import { useSyncExternalStore } from "react";
import { driveLink } from "./drive-link";

/**
 * Tasks / ideas for OG BOT typed while the drive is offline (e.g. on the phone with the laptop
 * off). Kept in this browser and sent to the drive as soon as it's reachable.
 */
export type QueuedIdea = { id: string; text: string; at: number };

const KEY = "og-idea-queue-v1";
let queue: QueuedIdea[] = [];
let loaded = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]") as unknown;
    queue = Array.isArray(raw) ? (raw as QueuedIdea[]).filter((i) => i && typeof i.text === "string") : [];
  } catch {
    queue = [];
  }
}
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(queue));
  } catch {
    /* private mode: keep in memory */
  }
  emit();
}

function driveBase(): string | null {
  const l = driveLink.get();
  return (l.mode === "local" || l.mode === "remote") && l.base ? l.base : null;
}

let sending = false;
/** Send everything waiting; returns how many reached the drive. */
export async function sendQueuedIdeas(): Promise<number> {
  load();
  const base = driveBase();
  if (!base || sending || !queue.length) return 0;
  sending = true;
  let sent = 0;
  try {
    for (const idea of [...queue]) {
      const r = await fetch(`${base}/og/repair/idea`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: idea.text }),
      });
      if (!r.ok) break;
      queue = queue.filter((q) => q.id !== idea.id);
      sent++;
    }
  } catch {
    /* drive went away; try again later */
  } finally {
    sending = false;
    save();
  }
  return sent;
}

export const ideaQueue = {
  get: () => (load(), queue),
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  /** Queue a task. Sent straight away when the drive is reachable. */
  add(text: string) {
    load();
    const t = text.trim().slice(0, 2000);
    if (!t) return;
    queue = [...queue, { id: `${Date.now()}-${queue.length}`, text: t, at: Date.now() }];
    save();
    void sendQueuedIdeas();
  },
  remove(id: string) {
    load();
    queue = queue.filter((q) => q.id !== id);
    save();
  },
  /** Test helper. */
  _reset() {
    loaded = true;
    queue = [];
    sending = false;
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
  },
};

let started = false;
/** Send waiting ideas whenever the drive becomes reachable. */
export function startIdeaQueue() {
  if (started || typeof window === "undefined") return;
  started = true;
  driveLink.subscribe(() => void sendQueuedIdeas());
  void sendQueuedIdeas();
}

const EMPTY: QueuedIdea[] = [];
export function useIdeaQueue() {
  return useSyncExternalStore(ideaQueue.subscribe, ideaQueue.get, () => EMPTY);
}
