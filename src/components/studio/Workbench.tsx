import { useState } from "react";
import { Monitor, Tablet, Smartphone } from "lucide-react";
import { Panel, Btn } from "./ui";
import { cn } from "@/lib/utils";
import { usePersistentState } from "@/hooks/use-persistent-state";
import hubHtml from "@/projects/og-bot-hub-starter/index.html?raw";
import hubCss from "@/projects/og-bot-hub-starter/styles.css?raw";
import hubJs from "@/projects/og-bot-hub-starter/app.js?raw";

type Files = Record<string, string>;

const BLANK: Files = {
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

const PROJECTS = {
  "og-bot-hub-starter": { "index.html": hubHtml, "styles.css": hubCss, "app.js": hubJs },
  "blank-app": BLANK,
} as Record<string, Files>;

const SIZES = { desktop: "100%", tablet: "768px", mobile: "375px" } as const;

function buildDoc(f: Files) {
  const html = f["index.html"] ?? "";
  if (/<html/i.test(html)) {
    return html
      .replace(/<link[^>]*href=["']styles\.css["'][^>]*>/i, `<style>${f["styles.css"] ?? ""}</style>`)
      .replace(/<script[^>]*src=["']app\.js["'][^>]*><\/script>/i, `<script>${f["app.js"] ?? ""}<\/script>`);
  }
  return `<!doctype html><html><head><style>${f["styles.css"] ?? ""}</style></head><body>${html}<script>${f["app.js"] ?? ""}<\/script></body></html>`;
}

export function Workbench() {
  const [project, setProject] = usePersistentState("ogbot.workbench.project", "og-bot-hub-starter");
  const [saved, setSaved] = usePersistentState<Record<string, Files>>("ogbot.workbench.files", {});
  const files = saved[project] ?? PROJECTS[project] ?? BLANK;
  const setFiles = (f: Files) => setSaved((s) => ({ ...s, [project]: f }));
  const [active, setActive] = useState("index.html");
  const [device, setDevice] = useState<keyof typeof SIZES>("desktop");
  const [nonce, setNonce] = useState(0);

  const pick = (p: string) => { setProject(p); setActive("index.html"); };

  return (
    <div className="grid h-full gap-3 lg:grid-cols-2">
      <Panel
        title="Code Editor"
        className="min-h-[520px]"
        right={
          <div className="flex items-center gap-2">
            <select aria-label="Project" value={project} onChange={(e) => pick(e.target.value)} className="rounded border border-border bg-background px-2 py-1 font-mono text-xs text-foreground">
              {Object.keys(PROJECTS).map((p) => <option key={p}>{p}</option>)}
            </select>
            <Btn variant="ghost" onClick={() => setSaved(({ [project]: _, ...rest }) => rest)}>Reset</Btn>
            <Btn variant="ghost" onClick={() => {
              const url = URL.createObjectURL(new Blob([buildDoc(files)], { type: "text/html" }));
              const a = document.createElement("a"); a.href = url; a.download = `${project}.html`;
              document.body.appendChild(a); a.click(); a.remove();
              setTimeout(() => URL.revokeObjectURL(url), 30000);
            }}>Export</Btn>
          </div>
        }
      >
        <div className="flex h-full flex-col">
          <div className="mb-2 flex gap-1">
            {Object.keys(files).map((f) => (
              <button key={f} onClick={() => setActive(f)} className={cn("rounded-t px-3 py-1 font-mono text-xs", active === f ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground")}>{f}</button>
            ))}
          </div>
          <textarea
            spellCheck={false}
            value={files[active]}
            onChange={(e) => setFiles({ ...files, [active]: e.target.value })}
            className="flex-1 min-h-[440px] resize-none rounded border border-border bg-background p-3 font-mono text-xs leading-relaxed text-foreground outline-none focus:border-primary"
          />
        </div>
      </Panel>
      <Panel
        title="Live Preview"
        className="min-h-[520px]"
        right={
          <div className="flex gap-1">
            {([["desktop", Monitor], ["tablet", Tablet], ["mobile", Smartphone]] as const).map(([k, Icon]) => (
              <button key={k} aria-label={k} onClick={() => setDevice(k)} className={cn("rounded p-1.5", device === k ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:text-primary")}>
                <Icon className="h-4 w-4" />
              </button>
            ))}
            <Btn variant="ghost" onClick={() => setNonce((n) => n + 1)}>Reload</Btn>
          </div>
        }
      >
        <div className="flex h-full justify-center overflow-auto rounded bg-muted/40 p-2">
          <iframe key={nonce} title="preview" sandbox="allow-scripts" srcDoc={buildDoc(files)} style={{ width: SIZES[device] }} className="h-full min-h-[440px] max-w-full rounded border border-border bg-background transition-all" />
        </div>
      </Panel>
    </div>
  );
}
