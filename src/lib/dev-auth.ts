import { useSyncExternalStore } from "react";
import { supabase } from "./supabase";

/**
 * Discreet DEV mode (role: DEV.B055). Two ways in, both convenience gates that
 * only control which UI surfaces show — real secrets already live server-side:
 *
 *  1) Google sign-in (Supabase Auth) with any allow-listed email.
 *  2) A local fallback code ("dev.b055") for offline / no-Gmail use.
 *
 * A successful unlock (either way) is remembered on the device so you aren't
 * re-asked and it works with no internet afterwards. Both D.EV accounts are synced
 * as dev via the allowlist (matches the database's is_dev() rule).
 */

export const DEV_ALLOWLIST = [
  "ogbot196@gmail.com",
  "ogstreamz196@gmail.com",
];
export const DEV_ROLE = "DEV.B055";

// Local fallback codes (accepted spellings). Not a secret — it only reveals dev UI.
const DEV_CODES = new Set(["dev.b055", "dev.bo55"]);
const LOCAL_KEY = "og-dev-unlock";

export function isAllowed(email: string | null | undefined): boolean {
  if (!email) return false;
  return DEV_ALLOWLIST.includes(email.trim().toLowerCase());
}
export function isDevCode(code: string): boolean {
  return DEV_CODES.has(code.trim().toLowerCase());
}

export type DevStatus = "checking" | "anon" | "signed-in" | "unavailable";
type State = { email: string | null; localUnlock: boolean; isDev: boolean; status: DevStatus };

const SERVER_SNAPSHOT: State = {
  email: null,
  localUnlock: false,
  isDev: false,
  status: "checking",
};
let state: State = {
  email: null,
  localUnlock: false,
  isDev: false,
  status: supabase ? "checking" : "unavailable",
};
const listeners = new Set<() => void>();
let started = false;

function readLocal(): boolean {
  try {
    return localStorage.getItem(LOCAL_KEY) === "1";
  } catch {
    return false;
  }
}
function writeLocal(on: boolean) {
  try {
    if (on) localStorage.setItem(LOCAL_KEY, "1");
    else localStorage.removeItem(LOCAL_KEY);
  } catch {
    /* ignore */
  }
}

function recompute(next: Partial<State>) {
  state = { ...state, ...next };
  state.isDev = isAllowed(state.email) || state.localUnlock;
  listeners.forEach((l) => l());
}

function applySession(email: string | null) {
  // Remember the device once an allow-listed account signs in.
  if (isAllowed(email)) writeLocal(true);
  recompute({ email, localUnlock: readLocal(), status: email ? "signed-in" : "anon" });
}

function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  const localUnlock = readLocal();
  if (!supabase) {
    recompute({ localUnlock, status: "unavailable" });
    return;
  }
  recompute({ localUnlock });
  void supabase.auth
    .getSession()
    .then(({ data }) => applySession(data.session?.user?.email ?? null))
    .catch(() => recompute({ status: "anon" }));
  supabase.auth.onAuthStateChange((_e, session) => applySession(session?.user?.email ?? null));
}

export const devAuth = {
  get: () => state,
  subscribe(l: () => void) {
    start();
    listeners.add(l);
    return () => listeners.delete(l);
  },
  async signIn(): Promise<{ ok: boolean; message: string }> {
    if (!supabase)
      return { ok: false, message: "Auth backend not configured. Use the local dev code instead." };
    try {
      const options: { redirectTo?: string } = {};
      if (typeof window !== "undefined") options.redirectTo = window.location.href;
      const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options });
      if (error) {
        const hint = /provider is not enabled/i.test(error.message)
          ? "Enable the Google provider in Supabase → Authentication → Providers, then try again (or use the local dev code)."
          : error.message;
        return { ok: false, message: hint };
      }
      return { ok: true, message: "Redirecting to Google…" };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : "Sign-in failed." };
    }
  },
  /** Local fallback unlock. Returns true when the code is accepted. */
  unlockWithCode(code: string): boolean {
    if (!isDevCode(code)) return false;
    writeLocal(true);
    recompute({ localUnlock: true });
    return true;
  },
  async lock() {
    writeLocal(false);
    if (supabase) await supabase.auth.signOut().catch(() => {});
    recompute({ email: null, localUnlock: false, status: "anon" });
  },
};

export function useDevAuth() {
  return useSyncExternalStore(devAuth.subscribe, devAuth.get, () => SERVER_SNAPSHOT);
}
