import { useSyncExternalStore } from "react";

/**
 * Permission gate. Every new "intelligent" capability is OFF by default and must
 * be explicitly granted by the user through an approval modal. requestPermission
 * resolves true only after the user clicks Allow; grants persist so the user
 * isn't re-asked, but they can revoke any time in the Self-Improve panel.
 *
 * This is the guardrail behind orchestration and self-improvement: nothing acts
 * without a grant the user gave.
 */

export type PermId = "orchestrate" | "self-tune" | "propose-code" | "apply-code";

export type PermissionDef = {
  id: PermId;
  title: string;
  description: string;
  danger?: boolean;
};

export const PERMISSIONS: PermissionDef[] = [
  {
    id: "orchestrate",
    title: "Use all models together",
    description:
      "Let the AI automatically route each task to the best of your connected local models, and chain a reasoning model into a coding model for harder jobs.",
  },
  {
    id: "self-tune",
    title: "Tune its own logic",
    description:
      "Let the AI adjust its own routing rules and system prompt at runtime to get better results. Changes stay on this device and are reversible.",
  },
  {
    id: "propose-code",
    title: "Propose front-end improvements",
    description:
      "Let the AI read its own interface and draft code/feature improvements for you to review. Proposals are shown only — nothing is applied.",
  },
  {
    id: "apply-code",
    title: "Open a merge request on your GitHub",
    description:
      "The only way the AI changes its own code: it opens a pull request (merge request) on your connected GitHub for you to review and merge — never a direct write to the live site. Requires the GitHub connector.",
    danger: true,
  },
];

type State = { granted: Record<string, boolean> };
const STORAGE_KEY = "og-permissions-v1";

function load(): State {
  const base: State = { granted: {} };
  if (typeof localStorage === "undefined") return base;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { granted: { ...(JSON.parse(raw) as State).granted } } : base;
  } catch {
    return base;
  }
}

const SERVER_SNAPSHOT: State = { granted: {} };
let state: State = load();
const listeners = new Set<() => void>();
let hydrated = false;

/** A single in-flight approval request the modal renders. */
export type PendingRequest = { def: PermissionDef; resolve: (ok: boolean) => void };
let pending: PendingRequest | null = null;
const pendingListeners = new Set<() => void>();

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
function notifyPending() {
  pendingListeners.forEach((l) => l());
}

export const permissions = {
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
  isGranted: (id: PermId) => !!state.granted[id],
  grant(id: PermId) {
    state = { granted: { ...state.granted, [id]: true } };
    persist();
    notify();
  },
  revoke(id: PermId) {
    const g = { ...state.granted };
    delete g[id];
    state = { granted: g };
    persist();
    notify();
  },
  /** Ask for a capability. Resolves immediately if already granted, else shows the modal. */
  request(id: PermId): Promise<boolean> {
    if (state.granted[id]) return Promise.resolve(true);
    const def = PERMISSIONS.find((p) => p.id === id);
    if (!def) return Promise.resolve(false);
    return new Promise<boolean>((resolve) => {
      pending = {
        def,
        resolve: (ok) => {
          if (ok) permissions.grant(id);
          pending = null;
          notifyPending();
          resolve(ok);
        },
      };
      notifyPending();
    });
  },
  getPending: () => pending,
  subscribePending(l: () => void) {
    pendingListeners.add(l);
    return () => pendingListeners.delete(l);
  },
  _reset() {
    state = { granted: {} };
    pending = null;
    persist();
    notify();
    notifyPending();
  },
};

export function usePermissions() {
  return useSyncExternalStore(permissions.subscribe, permissions.get, () => SERVER_SNAPSHOT);
}
export function usePendingPermission() {
  return useSyncExternalStore(permissions.subscribePending, permissions.getPending, () => null);
}
