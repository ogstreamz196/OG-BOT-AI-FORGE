import { useEffect, useSyncExternalStore } from "react";
import { connectors } from "./connectors";
import { driveLink } from "./drive-link";
import { DEFAULT_CODER } from "./dev-workbench";

/**
 * Live engine status for the navbar: is the local engine reachable, which model is active,
 * and its parameter count + context size. Tools call setActiveModel() when they switch model.
 */
export type ModelFacts = { params?: string; context?: number; loaded?: boolean };
type State = { online: boolean | null; host: string; model: string; facts: ModelFacts };

let state: State = { online: null, host: "127.0.0.1:11434", model: DEFAULT_CODER, facts: {} };
const listeners = new Set<() => void>();
const emit = (patch: Partial<State>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};

export function setActiveModel(model: string) {
  if (model && model !== state.model) {
    emit({ model, facts: {} });
    void refresh();
  }
}

/** "16384" → "16k". */
export const ctxLabel = (n?: number) =>
  !n ? "" : n >= 1024 ? `${Math.round(n / 1024)}k ctx` : `${n} ctx`;

/** Pull parameter size and context out of Ollama's /api/show and /api/ps replies. Pure + tested. */
export function factsFrom(show: unknown, ps: unknown, model: string): ModelFacts {
  const s = (show ?? {}) as {
    details?: { parameter_size?: string };
    model_info?: Record<string, unknown>;
    parameters?: string;
  };
  const p =
    ((ps ?? {}) as { models?: { name?: string; model?: string; context_length?: number }[] })
      .models ?? [];
  const norm = (t?: string) => (t && !t.includes(":") ? `${t}:latest` : t);
  const running = p.find((m) => norm(m.name) === norm(model) || norm(m.model) === norm(model));
  const numCtx = Number(s.parameters?.match(/num_ctx\s+(\d+)/)?.[1]) || undefined;
  const trained = Object.entries(s.model_info ?? {}).find(([k]) =>
    k.endsWith(".context_length"),
  )?.[1] as number | undefined;
  return {
    ...(s.details?.parameter_size ? { params: s.details.parameter_size } : {}),
    ...(running?.context_length
      ? { context: running.context_length }
      : numCtx
        ? { context: numCtx }
        : trained
          ? { context: trained }
          : {}),
    loaded: !!running,
  };
}

const showCache = new Map<string, unknown>();

async function refresh() {
  const base = (connectors.configOf("ollama")["baseUrl"] || "http://127.0.0.1:11434").replace(
    /\/+$/,
    "",
  );
  const link = driveLink.get();
  const host =
    link.mode === "remote"
      ? "your drive (remote)"
      : link.mode === "local"
        ? "drive · 127.0.0.1:11434"
        : base.replace(/^https?:\/\//, "");
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 5000);
  try {
    const ps = await (await fetch(`${base}/api/ps`, { signal: ctl.signal })).json();
    let show = showCache.get(state.model);
    if (!show) {
      const r = await fetch(`${base}/api/show`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: state.model }),
        signal: ctl.signal,
      });
      show = r.ok ? await r.json() : {};
      if (r.ok) showCache.set(state.model, show);
    }
    emit({ online: true, host, facts: factsFrom(show, ps, state.model) });
  } catch {
    emit({ online: false, host, facts: {} });
  } finally {
    clearTimeout(t);
  }
}

let timer: ReturnType<typeof setInterval> | null = null;
export const engineStatus = {
  get: () => state,
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  refresh,
};

export function useEngineStatus() {
  useEffect(() => {
    if (timer || typeof window === "undefined") return;
    void refresh();
    timer = setInterval(() => void refresh(), 15_000);
  }, []);
  return useSyncExternalStore(engineStatus.subscribe, engineStatus.get, engineStatus.get);
}
