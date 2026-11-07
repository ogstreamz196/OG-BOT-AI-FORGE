import { useSyncExternalStore } from "react";

/**
 * Connectors: integrations the builder and the apps it generates can use.
 * Local engines (Ollama / ComfyUI) run on the user's machine; cloud connectors
 * (Supabase / Stripe / Email / REST) are configured here for scaffolding.
 *
 * Only non-secret values are stored client-side (publishable/anon keys, base
 * URLs). Secret keys (Stripe secret, Resend) must live on the Worker/server —
 * the UI says so and never persists them in the browser.
 */

export type ConnKind =
  "ollama" | "comfyui" | "supabase" | "stripe" | "rest" | "email" | "suno" | "github";
export type ConnCategory = "Local AI" | "Backend" | "Payments" | "Integrations";

export type ConnField = { key: string; label: string; placeholder?: string; secret?: boolean };

export type ConnectorDef = {
  kind: ConnKind;
  name: string;
  category: ConnCategory;
  blurb: string;
  fields: ConnField[];
  /** Field key holding the base URL to health-check (local engines). */
  pingField?: string;
  pingPath?: string;
};

export const CONNECTOR_CATALOG: ConnectorDef[] = [
  {
    kind: "ollama",
    name: "Ollama (local LLM)",
    category: "Local AI",
    blurb: "Local code/reasoning models on your machine. Powers the AI builder — fully offline.",
    fields: [{ key: "baseUrl", label: "Base URL", placeholder: "http://localhost:11434" }],
    pingField: "baseUrl",
    pingPath: "/api/tags",
  },
  {
    kind: "comfyui",
    name: "ComfyUI (local images)",
    category: "Local AI",
    blurb: "Local Stable Diffusion image generation on your GPU.",
    fields: [{ key: "baseUrl", label: "Base URL", placeholder: "http://localhost:8188" }],
    pingField: "baseUrl",
    pingPath: "/system_stats",
  },
  {
    kind: "supabase",
    name: "Supabase",
    category: "Backend",
    blurb: "Database, auth and storage for the apps you build.",
    fields: [
      { key: "url", label: "Project URL", placeholder: "https://xxx.supabase.co" },
      { key: "anonKey", label: "Publishable (anon) key", placeholder: "sb_publishable_…" },
    ],
  },
  {
    kind: "stripe",
    name: "Stripe",
    category: "Payments",
    blurb: "Checkout and payments. Publishable key here; the secret key goes on the server.",
    fields: [{ key: "publishableKey", label: "Publishable key", placeholder: "pk_live_…" }],
  },
  {
    kind: "rest",
    name: "REST / Webhooks",
    category: "Integrations",
    blurb: "Call any REST API or receive webhooks from the apps you build.",
    fields: [{ key: "baseUrl", label: "API base URL", placeholder: "https://api.example.com" }],
  },
  {
    kind: "github",
    name: "GitHub",
    category: "Integrations",
    blurb:
      "Read all your repos and open merge requests. The token is a Worker secret (GITHUB_TOKEN), never in the browser.",
    fields: [
      { key: "owner", label: "Default owner/repo", placeholder: "ogstreamz196/offline-ai-forge" },
    ],
  },
  {
    kind: "suno",
    name: "Suno (music)",
    category: "Integrations",
    blurb:
      "AI music generation. Paste your Suno API endpoint; the key is entered per-session in the Music Video Studio, not stored.",
    fields: [{ key: "endpoint", label: "API endpoint", placeholder: "https://api.suno.ai/…" }],
  },
  {
    kind: "email",
    name: "Email (Resend)",
    category: "Integrations",
    blurb: "Send transactional email. The API key is a server secret — set it on the Worker.",
    fields: [{ key: "fromAddress", label: "From address", placeholder: "hello@ogbot.co.uk" }],
  },
];

type State = {
  enabled: Record<string, boolean>;
  config: Record<string, Record<string, string>>;
};

const STORAGE_KEY = "og-connectors-v1";

function defaults(): State {
  const enabled: Record<string, boolean> = {};
  const config: Record<string, Record<string, string>> = {};
  for (const c of CONNECTOR_CATALOG) config[c.kind] = {};
  // Sensible local defaults.
  config["ollama"] = { baseUrl: "http://localhost:11434" };
  config["comfyui"] = { baseUrl: "http://localhost:8188" };
  // Prefill Supabase from the build env (public values).
  const url = (import.meta.env["VITE_SUPABASE_URL"] as string | undefined) ?? "";
  const anonKey = (import.meta.env["VITE_SUPABASE_ANON_KEY"] as string | undefined) ?? "";
  config["supabase"] = { url, anonKey };
  if (url && anonKey) enabled["supabase"] = true;
  return { enabled, config };
}

function load(): State {
  const base = defaults();
  if (typeof localStorage === "undefined") return base;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return base;
    const saved = JSON.parse(raw) as Partial<State>;
    return {
      enabled: { ...base.enabled, ...(saved.enabled ?? {}) },
      config: { ...base.config, ...(saved.config ?? {}) },
    };
  } catch {
    return base;
  }
}

const SERVER_SNAPSHOT = defaults();
let state: State = defaults();
const listeners = new Set<() => void>();
let hydrated = false;

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
function set(next: State) {
  state = next;
  persist();
  notify();
}

export const connectors = {
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
  isEnabled: (kind: ConnKind) => !!state.enabled[kind],
  configOf: (kind: ConnKind) => state.config[kind] ?? {},
  toggle(kind: ConnKind, on?: boolean) {
    const value = on ?? !state.enabled[kind];
    set({ ...state, enabled: { ...state.enabled, [kind]: value } });
  },
  setField(kind: ConnKind, key: string, value: string) {
    set({
      ...state,
      config: { ...state.config, [kind]: { ...(state.config[kind] ?? {}), [key]: value } },
    });
  },
  enabledCount: () => Object.values(state.enabled).filter(Boolean).length,
  _reset() {
    state = defaults();
    persist();
    notify();
  },
};

export function useConnectors() {
  return useSyncExternalStore(connectors.subscribe, connectors.get, () => SERVER_SNAPSHOT);
}
