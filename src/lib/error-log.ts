import { useSyncExternalStore } from "react";
import { driveLink } from "./drive-link";
import { engineStatus } from "./engine-status";
import { connectors } from "./connectors";

/**
 * Error log + self-heal. Every error the site shows is recorded with the detail OG BOT needs
 * to fix it (what, where, the last actions, device, build, drive and engine state). Known
 * problems are repaired on the spot; everything is sent to the drive, where OG BOT
 * (qwen2.5-coder:14b) tries a code fix, checks it and publishes it (og_self_repair.py).
 */
export type Crumb = { t: number; kind: "view" | "click" | "nav" | "note"; text: string; view?: string };
export type ErrorEntry = {
  fingerprint: string;
  kind: "crash" | "error" | "promise" | "console" | "engine" | "healed";
  message: string;
  count: number;
  first: number;
  last: number;
  build: string;
  healed?: string;
  detail: { stack?: string; extra?: Record<string, unknown>; context: Record<string, unknown> };
  sent?: boolean;
};

const KEY = "og-error-log-v1";
const MAX = 80;
let entries: ErrorEntry[] = [];
let crumbs: Crumb[] = [];
let currentView = "create";
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function load() {
  try {
    entries = JSON.parse(localStorage.getItem(KEY) ?? "[]") as ErrorEntry[];
  } catch {
    entries = [];
  }
}
function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(entries.slice(-MAX)));
  } catch {
    /* storage full or blocked */
  }
}

/** Which build of the site is running (the hashed main bundle name changes every publish). */
export function buildId(): string {
  if (typeof document === "undefined") return "server";
  const src = [...document.querySelectorAll<HTMLScriptElement>("script[src]")].map((s) => s.src).find((s) => /\/assets\/.+\.js/.test(s));
  return src ? (src.split("/").pop() ?? "unknown") : "dev";
}

/** Same bug → same fingerprint, even with different numbers, ids or URLs in the message. */
export function fingerprint(kind: string, message: string, stack?: string): string {
  const norm = message
    .replace(/https?:\/\/\S+/g, "<url>")
    .replace(/\b[0-9a-f]{8,}\b/gi, "<id>")
    .replace(/\d+/g, "<n>")
    .slice(0, 200);
  const frame = (stack ?? "").split("\n").find((l) => /at |@/.test(l))?.replace(/:\d+:\d+/g, "").trim() ?? "";
  let h = 5381;
  for (const ch of `${kind}|${norm}|${frame}`) h = ((h << 5) + h + ch.charCodeAt(0)) | 0;
  return `${kind}-${(h >>> 0).toString(16)}`;
}

function context(): Record<string, unknown> {
  const drive = driveLink.get();
  const eng = engineStatus.get();
  return {
    view: currentView,
    url: typeof location !== "undefined" ? location.pathname + location.search : "",
    build: buildId(),
    time: new Date().toISOString(),
    online: typeof navigator !== "undefined" ? navigator.onLine : null,
    device: typeof navigator !== "undefined" ? navigator.userAgent : "",
    screen: typeof window !== "undefined" ? `${window.innerWidth}x${window.innerHeight}@${window.devicePixelRatio}` : "",
    drive: { mode: drive.mode, message: drive.message, tier: drive.status?.tier, gpu: drive.status?.hardware?.gpu, services: drive.status?.services },
    engine: { online: eng.online, host: eng.host, model: eng.model, ...eng.facts },
    connectors: { ollama: connectors.isEnabled("ollama"), comfyui: connectors.isEnabled("comfyui"), ollamaUrl: connectors.configOf("ollama")["baseUrl"] },
    breadcrumbs: crumbs.slice(-15),
  };
}

// ── self-heal playbook: known problems fixed on the spot ──────────────────────
type Heal = { id: string; match: (msg: string) => boolean; fix: () => Promise<string> | string };
const healedThisSession = new Set<string>();
export const HEALS: Heal[] = [
  {
    // A new version was published while this tab was open: its old code files are gone.
    id: "stale-build",
    match: (m) => /Failed to fetch dynamically imported module|Importing a module script failed|ChunkLoadError|error loading dynamically imported module/i.test(m),
    fix: () => {
      try {
        if (sessionStorage.getItem("og-heal-reload")) return "already reloaded once; left for OG BOT";
        sessionStorage.setItem("og-heal-reload", "1");
      } catch {
        /* ignore */
      }
      setTimeout(() => location.reload(), 300);
      return "reloaded to the newest version";
    },
  },
  {
    // The AI engine stopped answering: find the drive again and re-check the engine.
    id: "engine-unreachable",
    match: (m) => /Failed to fetch|NetworkError|Load failed|didn't answer|not reachable|ECONNREFUSED|engine not running|502/i.test(m),
    fix: async () => {
      const l = await (await import("./drive-link")).resolveDrive();
      await engineStatus.refresh();
      return `re-connected: ${l.message}`;
    },
  },
  {
    // An engine connector was switched off although the drive is there.
    id: "engine-disabled",
    match: (m) => /Enable Ollama|no LLM|connector.*(off|disabled)/i.test(m),
    fix: () => {
      connectors.toggle("ollama", true);
      return "switched the Ollama connector back on";
    },
  },
];

async function tryHeal(e: ErrorEntry) {
  const heal = HEALS.find((h) => h.match(e.message));
  if (!heal || healedThisSession.has(`${heal.id}:${e.fingerprint}`)) return;
  healedThisSession.add(`${heal.id}:${e.fingerprint}`);
  try {
    e.healed = `${heal.id}: ${await heal.fix()}`;
  } catch (err) {
    e.healed = `${heal.id}: failed (${err instanceof Error ? err.message : String(err)})`;
  }
  persist();
  emit();
}

let flushTimer: ReturnType<typeof setTimeout> | null = null;
/** Send unsent entries to the drive (local or remote); kept and retried until it's reachable. */
export async function flush(): Promise<number> {
  const l = driveLink.get();
  const pending = entries.filter((e) => !e.sent);
  if (!pending.length || (l.mode !== "local" && l.mode !== "remote") || !l.base) return 0;
  try {
    const res = await fetch(`${l.base}/og/errors`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        // Repaired on the spot → "healed", so OG BOT doesn't rewrite code for it.
        errors: pending.map(({ sent: _s, ...e }) => ({ ...e, kind: e.healed && !/failed|already/.test(e.healed) ? "healed" : e.kind })),
      }),
    });
    if (!res.ok) return 0;
    pending.forEach((e) => (e.sent = true));
    persist();
    emit();
    return pending.length;
  } catch {
    return 0;
  }
}
const scheduleFlush = () => {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => void flush(), 1500);
};

/** Record an error (or a problem shown on screen) with full context. */
export function report(kind: ErrorEntry["kind"], error: unknown, extra?: Record<string, unknown>): ErrorEntry | null {
  const message = (error instanceof Error ? `${error.name}: ${error.message}` : typeof error === "string" ? error : JSON.stringify(error)) ?? "unknown";
  if (!message || /ResizeObserver loop|og-error-log/i.test(message)) return null;
  const stack = error instanceof Error ? error.stack?.slice(0, 4000) : undefined;
  const fp = fingerprint(kind, message, stack);
  const now = Date.now();
  let e = entries.find((x) => x.fingerprint === fp);
  if (e) {
    e.count += 1;
    e.last = now;
    e.sent = false;
    e.detail = { ...(stack ? { stack } : {}), ...(extra ? { extra } : {}), context: context() };
  } else {
    e = {
      fingerprint: fp,
      kind,
      message: message.slice(0, 1000),
      count: 1,
      first: now,
      last: now,
      build: buildId(),
      detail: { ...(stack ? { stack } : {}), ...(extra ? { extra } : {}), context: context() },
    };
    entries.push(e);
    if (entries.length > MAX) entries = entries.slice(-MAX);
  }
  persist();
  emit();
  void tryHeal(e);
  scheduleFlush();
  return e;
}

export function crumb(kind: Crumb["kind"], text: string) {
  if (kind === "view") currentView = text;
  crumbs = [...crumbs.slice(-29), { t: Date.now(), kind, text: text.slice(0, 80), view: currentView }];
}

/** A Markdown brief with everything needed to fix one error (copy/paste anywhere). */
export function fixBrief(e: ErrorEntry): string {
  return [
    `# Error: ${e.message}`,
    `- kind: ${e.kind} · seen ${e.count}× · first ${new Date(e.first).toISOString()} · last ${new Date(e.last).toISOString()}`,
    `- build: ${e.build}${e.healed ? `\n- self-heal: ${e.healed}` : ""}`,
    e.detail.stack ? `\n## Stack\n\`\`\`\n${e.detail.stack}\n\`\`\`` : "",
    `\n## Context\n\`\`\`json\n${JSON.stringify({ ...e.detail.context, extra: e.detail.extra }, null, 2)}\n\`\`\``,
  ].join("\n");
}

let installed = false;
/** Start capturing (client only, once). */
export function installErrorLog() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  load();
  window.addEventListener("error", (ev) => report("error", ev.error ?? ev.message, { source: ev.filename, line: ev.lineno, col: ev.colno }));
  window.addEventListener("unhandledrejection", (ev) => report("promise", ev.reason));
  const original = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    original(...args);
    const err = args.find((a) => a instanceof Error) ?? args.map((a) => (typeof a === "string" ? a : "")).join(" ").trim();
    if (err && !(typeof err === "string" && /^Warning:|act\(/.test(err))) report("console", err);
  };
  document.addEventListener(
    "click",
    (ev) => {
      const el = (ev.target as HTMLElement | null)?.closest("button,a,[role=tab]");
      if (el) crumb("click", el.getAttribute("aria-label") || el.textContent?.trim() || el.tagName);
    },
    { capture: true },
  );
  window.addEventListener("online", () => void flush());
  driveLink.subscribe(() => scheduleFlush());
  scheduleFlush();
}

export const errorLog = {
  get: () => entries,
  subscribe(l: () => void) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
  clear() {
    entries = [];
    persist();
    emit();
  },
};

export function useErrorLog() {
  return useSyncExternalStore(errorLog.subscribe, errorLog.get, () => [] as ErrorEntry[]);
}
