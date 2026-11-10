import { useSyncExternalStore } from "react";
import { supabase } from "./supabase";
import { connectors } from "./connectors";

/**
 * Drive link: the website is only the front end; the AI runs on the drive.
 *
 *  1. Drive plugged into this computer → talk to its server at 127.0.0.1:11500 (works offline).
 *  2. Otherwise, signed in as D.EV → look up the drive's current tunnel address (it registers
 *     itself whenever it's online) and talk to it remotely, from any device.
 *  3. Otherwise, a plain local Ollama on 11434 still works directly.
 *
 * The Ollama / ComfyUI connector addresses are pointed at whichever route is live, and remote
 * requests get the signed-in Supabase token added, so every studio tool works unchanged.
 */

export const LOCAL_DRIVE = "http://127.0.0.1:11500";
const LOCAL_OLLAMA = "http://127.0.0.1:11434";
const LOCAL_COMFY = "http://127.0.0.1:8188";

export type DriveHardware = {
  gpu: string | null;
  vram_gb: number;
  rtx5080: boolean;
  cpu?: string;
  ram_gb?: number | null;
  tier: "ultra" | "handheld";
  max_params_b?: number;
};
export type DriveStatus = {
  ok: boolean;
  version: string;
  hardware: DriveHardware;
  tier: "ultra" | "handheld";
  services: { ollama: boolean; comfyui: boolean };
  online: boolean;
  public_url: string | null;
  registered: boolean;
  log?: string[];
};
export type DriveMode = "checking" | "local" | "remote" | "direct" | "none";
export type DriveLink = {
  mode: DriveMode;
  base: string | null;
  status: DriveStatus | null;
  message: string;
};

let link: DriveLink = {
  mode: "checking",
  base: null,
  status: null,
  message: "Looking for your drive…",
};
const listeners = new Set<() => void>();
function set(next: DriveLink): DriveLink {
  link = next;
  applyRoutes(next);
  listeners.forEach((l) => l());
  return next;
}

async function getJSON<T>(
  url: string,
  headers: Record<string, string> = {},
  ms = 4000,
): Promise<T> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await origFetch()(url, { headers, signal: ctl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(t);
  }
}

async function accessToken(): Promise<string | null> {
  if (!supabase) return null;
  try {
    return (await supabase.auth.getSession()).data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

/** Is this connector address one we manage automatically (vs. something the user typed)? */
export function isManagedUrl(u: string | undefined): boolean {
  return (
    !u ||
    /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/.test(u) ||
    /^https:\/\/[a-z0-9-]+\.trycloudflare\.com(\/|$)/.test(u)
  );
}

/** Where Ollama / ComfyUI calls should go for a given link. Pure + tested. */
export function routesFor(l: Pick<DriveLink, "mode" | "base">): {
  ollama: string;
  comfyui: string;
} {
  if ((l.mode === "local" || l.mode === "remote") && l.base)
    return { ollama: `${l.base}/ollama`, comfyui: `${l.base}/comfy` };
  return { ollama: LOCAL_OLLAMA, comfyui: LOCAL_COMFY };
}

function applyRoutes(l: DriveLink) {
  if (l.mode === "checking") return;
  const r = routesFor(l);
  for (const kind of ["ollama", "comfyui"] as const) {
    const cur = connectors.configOf(kind)["baseUrl"];
    if (isManagedUrl(cur) && cur !== r[kind]) connectors.setField(kind, "baseUrl", r[kind]);
  }
}

const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 60
    ? `${m} min ago`
    : m < 2880
      ? `${Math.round(m / 60)} h ago`
      : `${Math.round(m / 1440)} days ago`;
};

export async function resolveDrive(): Promise<DriveLink> {
  // 1. The drive is plugged into this computer.
  try {
    const s = await getJSON<DriveStatus>(`${LOCAL_DRIVE}/og/status`, {}, 2500);
    return set({
      mode: "local",
      base: LOCAL_DRIVE,
      status: s,
      message: "Drive connected to this computer",
    });
  } catch {
    /* not here */
  }
  // 2. The drive is online somewhere else.
  let lastSeen = "";
  const token = await accessToken();
  if (supabase && token) {
    try {
      const { data } = await supabase
        .from("drive_endpoints")
        .select("url,updated_at")
        .maybeSingle();
      const row = data as { url?: string; updated_at?: string } | null;
      if (row?.url) {
        try {
          const s = await getJSON<DriveStatus>(
            `${row.url}/og/status`,
            { Authorization: `Bearer ${token}` },
            8000,
          );
          return set({
            mode: "remote",
            base: row.url,
            status: s,
            message: "Connected to your drive remotely",
          });
        } catch {
          lastSeen = row.updated_at ? ` (last online ${ago(row.updated_at)})` : "";
        }
      }
    } catch {
      /* offline or not allowed */
    }
  }
  // 3. Plain local Ollama without the drive server.
  try {
    await getJSON(`${LOCAL_OLLAMA}/api/tags`, {}, 2500);
    return set({
      mode: "direct",
      base: null,
      status: null,
      message: "Local Ollama (drive server not running)",
    });
  } catch {
    /* nothing */
  }
  return set({
    mode: "none",
    base: null,
    status: null,
    message: token
      ? `Drive offline${lastSeen}`
      : "Drive not found here. Sign in as D.EV to reach it remotely",
  });
}

// ── auth header for remote calls (so every tool works unchanged) ────────────
let original: typeof fetch | null = null;
const origFetch = () => original ?? globalThis.fetch.bind(globalThis);

export function installDriveFetch() {
  if (original || typeof window === "undefined") return;
  original = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (link.mode === "remote" && link.base && url.startsWith(link.base)) {
      const token = await accessToken();
      if (token) {
        const headers = new Headers(
          init?.headers ?? (input instanceof Request ? input.headers : undefined),
        );
        headers.set("Authorization", `Bearer ${token}`);
        return original!(input, { ...init, headers });
      }
    }
    return original!(input, init);
  };
}

let started = false;
/** Start once per page: find the drive now, then every 30 s and whenever the network changes. */
export function startDriveLink() {
  if (started || typeof window === "undefined") return;
  started = true;
  installDriveFetch();
  void resolveDrive();
  setInterval(() => void resolveDrive(), 30_000);
  window.addEventListener("online", () => void resolveDrive());
  supabase?.auth.onAuthStateChange(() => void resolveDrive());
}

export const driveLink = {
  get: () => link,
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  /** Make a new pairing key (D.EV only) for the drive's og-drive.json. */
  async pair(): Promise<{ ok: true; key: string } | { ok: false; message: string }> {
    if (!supabase) return { ok: false, message: "Sign-in backend not configured" };
    const { data, error } = await supabase.rpc("create_drive_key");
    if (error || typeof data !== "string")
      return { ok: false, message: error?.message ?? "Sign in with a D.EV Google account first" };
    return { ok: true, key: data };
  },
};

export function useDriveLink() {
  return useSyncExternalStore(driveLink.subscribe, driveLink.get, driveLink.get);
}
