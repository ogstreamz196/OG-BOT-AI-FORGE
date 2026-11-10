import { useSyncExternalStore } from "react";
import hubHtml from "@/projects/og-bot-hub-starter/index.html?raw";
import hubCss from "@/projects/og-bot-hub-starter/styles.css?raw";
import hubJs from "@/projects/og-bot-hub-starter/app.js?raw";
import { mobileStubs } from "./mobile-stubs";
import { WEB_TEMPLATES } from "./web-templates";
import { connectors } from "./connectors";

/**
 * Shared workspace store: the single source of truth for the files open in the
 * Workbench. The Agent console mutates it via /scaffold and /edit, and the
 * Workbench re-renders from it. Lives at module scope so state survives tab
 * switches (the studio unmounts inactive tabs).
 */

export type Files = Record<string, string>;
export type Workspace = { project: string; files: Files; active: string; rev: number };

export const BLANK: Files = {
  "index.html": `<div class="app">
  <h1>Hello from OG-BOT</h1>
  <p>Edit the code — the preview updates live.</p>
  <button onclick="this.textContent='Clicked ✓'">Tap me</button>
</div>`,
  "styles.css": `body{margin:0;font-family:system-ui;background:#0b0f1e;color:#e6e9f5}
.app{padding:32px;text-align:center}
h1{color:#fff;letter-spacing:.02em}
button{background:#3d5afe;color:#fff;border:0;padding:12px 20px;border-radius:6px;font-size:16px}`,
  "app.js": `console.log("OG-BOT preview ready");`,
};

export const TEMPLATES: Record<string, Files> = {
  "og-bot-hub-starter": { "index.html": hubHtml, "styles.css": hubCss, "app.js": hubJs },
  "blank-app": BLANK,
  // Repository-ready mobile scaffolding baked in (Capacitor + Expo + android/ios).
  "mobile-ready": { ...BLANK, ...mobileStubs() },
  // Ready-made website starters composed from the section library.
  ...WEB_TEMPLATES,
};

/** Projects the user (or agent) has created this session, keyed by name. */
const projects: Record<string, Files> = { ...TEMPLATES };

// Start on a clean canvas so "describe a change" in the AI builder works
// immediately; the OG-BOT HUB sample is one /scaffold (or Advanced Editor) away.
let state: Workspace = {
  project: "blank-app",
  files: { ...TEMPLATES["blank-app"]! },
  active: "index.html",
  rev: 0,
};
const listeners = new Set<() => void>();

// Saved in this browser so projects and edits survive reloads (localStorage).
const WS_KEY = "og-workspace-v1";
let hydrated = false;

function save() {
  try {
    // Only projects that differ from the built-in templates need saving.
    const changed: Record<string, Files> = {};
    for (const [name, files] of Object.entries(projects)) if (files !== TEMPLATES[name]) changed[name] = files;
    localStorage.setItem(WS_KEY, JSON.stringify({ project: state.project, active: state.active, projects: changed }));
  } catch {
    /* storage unavailable (private mode / blocked): keep working in memory */
  }
}

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = localStorage.getItem(WS_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw) as { project?: string; active?: string; projects?: Record<string, Files> };
    Object.assign(projects, saved.projects ?? {});
    const name = saved.project && projects[saved.project] ? saved.project : state.project;
    const files = { ...projects[name]! };
    const active = saved.active && saved.active in files ? saved.active : "index.html";
    state = { project: name, files, active, rev: state.rev + 1 };
    listeners.forEach((l) => l());
  } catch {
    /* corrupt or unavailable: start fresh */
  }
}

function set(next: Partial<Workspace>) {
  state = { ...state, ...next, rev: state.rev + 1 };
  projects[state.project] = state.files;
  save();
  listeners.forEach((l) => l());
}

export const workspace = {
  get: () => state,
  subscribe(l: () => void) {
    listeners.add(l);
    hydrate();
    return () => listeners.delete(l);
  },
  projectNames: () => Object.keys(projects),
  open(name: string) {
    const files = projects[name];
    if (!files) return false;
    set({ project: name, files: { ...files }, active: "index.html" });
    return true;
  },
  /** Create (or overwrite) a project from a template and open it. */
  create(name: string, template: string = "blank-app") {
    projects[name] = { ...(TEMPLATES[template] ?? BLANK) };
    set({ project: name, files: { ...projects[name]! }, active: "index.html" });
  },
  reset() {
    set({ files: { ...(TEMPLATES[state.project] ?? BLANK) } });
  },
  setActive: (active: string) => set({ active }),
  writeFile: (name: string, content: string) => set({ files: { ...state.files, [name]: content } }),
  writeFiles: (patch: Files) => set({ files: { ...state.files, ...patch } }),
  /** Test helper: restore initial state. */
  _reset() {
    hydrated = true;
    try {
      localStorage.removeItem(WS_KEY);
    } catch {
      /* ignore */
    }
    for (const k of Object.keys(projects)) delete projects[k];
    Object.assign(projects, TEMPLATES);
    state = {
      project: "blank-app",
      files: { ...TEMPLATES["blank-app"]! },
      active: "index.html",
      rev: 0,
    };
    listeners.forEach((l) => l());
  },
};

export function useWorkspace() {
  return useSyncExternalStore(workspace.subscribe, workspace.get, workspace.get);
}

/**
 * A tiny config script injected into built/exported pages: sets window.OG_PROJECT
 * and, when the Supabase connector is enabled, window.OG_SUPABASE so generated
 * features (e.g. the contact form) can talk to the backend. Publishable key only.
 */
function connectorConfigScript(): string {
  let cfg = `window.OG_PROJECT=${JSON.stringify(state.project)};`;
  try {
    if (connectors.isEnabled("supabase")) {
      const c = connectors.configOf("supabase");
      if (c["url"] && c["anonKey"]) {
        cfg += `window.OG_SUPABASE={url:${JSON.stringify(c["url"])},key:${JSON.stringify(c["anonKey"])}};`;
      }
    }
  } catch {
    /* connectors unavailable — OG_PROJECT only */
  }
  return `<script>${cfg}</script>`;
}

const injectAfterBody = (doc: string, inject: string) =>
  /<body[^>]*>/i.test(doc)
    ? doc.replace(/<body[^>]*>/i, (m) => `${m}${inject}`)
    : `${inject}${doc}`;

/** Inline styles.css and app.js into a single self-contained HTML document. */
export function buildDoc(f: Files) {
  const html = f["index.html"] ?? "";
  const css = f["styles.css"] ?? "";
  const js = f["app.js"] ?? "";
  const cfg = connectorConfigScript();
  if (/<html/i.test(html)) {
    // Function replacers so `$` sequences in user code are not treated as patterns.
    const doc = html
      .replace(/<link[^>]*href=["']styles\.css["'][^>]*>/i, () => `<style>${css}</style>`)
      .replace(/<script[^>]*src=["']app\.js["'][^>]*><\/script>/i, () => `<script>${js}</script>`);
    return injectAfterBody(doc, cfg);
  }
  return `<!doctype html><html><head><style>${css}</style></head><body>${cfg}${html}<script>${js}</script></body></html>`;
}

/** Wrap a fragment index.html in a full document that links styles.css / app.js, for multi-file export. */
export function standaloneIndex(f: Files) {
  const html = f["index.html"] ?? "";
  const cfg = connectorConfigScript();
  if (/<html/i.test(html)) return injectAfterBody(html, cfg);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="styles.css">
</head>
<body>
${cfg}
${html}
<script src="app.js"></script>
</body>
</html>
`;
}
