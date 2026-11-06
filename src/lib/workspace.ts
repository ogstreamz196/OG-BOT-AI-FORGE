import { useSyncExternalStore } from "react";
import hubHtml from "@/projects/og-bot-hub-starter/index.html?raw";
import hubCss from "@/projects/og-bot-hub-starter/styles.css?raw";
import hubJs from "@/projects/og-bot-hub-starter/app.js?raw";

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
};

/** Projects the user (or agent) has created this session, keyed by name. */
const projects: Record<string, Files> = { ...TEMPLATES };

let state: Workspace = {
  project: "og-bot-hub-starter",
  files: { ...TEMPLATES["og-bot-hub-starter"]! },
  active: "index.html",
  rev: 0,
};
const listeners = new Set<() => void>();

function set(next: Partial<Workspace>) {
  state = { ...state, ...next, rev: state.rev + 1 };
  projects[state.project] = state.files;
  listeners.forEach((l) => l());
}

export const workspace = {
  get: () => state,
  subscribe(l: () => void) {
    listeners.add(l);
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
    for (const k of Object.keys(projects)) delete projects[k];
    Object.assign(projects, TEMPLATES);
    state = {
      project: "og-bot-hub-starter",
      files: { ...TEMPLATES["og-bot-hub-starter"]! },
      active: "index.html",
      rev: 0,
    };
    listeners.forEach((l) => l());
  },
};

export function useWorkspace() {
  return useSyncExternalStore(workspace.subscribe, workspace.get, workspace.get);
}

/** Inline styles.css and app.js into a single self-contained HTML document. */
export function buildDoc(f: Files) {
  const html = f["index.html"] ?? "";
  const css = f["styles.css"] ?? "";
  const js = f["app.js"] ?? "";
  if (/<html/i.test(html)) {
    // Function replacers so `$` sequences in user code are not treated as patterns.
    return html
      .replace(/<link[^>]*href=["']styles\.css["'][^>]*>/i, () => `<style>${css}</style>`)
      .replace(/<script[^>]*src=["']app\.js["'][^>]*><\/script>/i, () => `<script>${js}</script>`);
  }
  return `<!doctype html><html><head><style>${css}</style></head><body>${html}<script>${js}</script></body></html>`;
}

/** Wrap a fragment index.html in a full document that links styles.css / app.js, for multi-file export. */
export function standaloneIndex(f: Files) {
  const html = f["index.html"] ?? "";
  if (/<html/i.test(html)) return html;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="styles.css">
</head>
<body>
${html}
<script src="app.js"></script>
</body>
</html>
`;
}
