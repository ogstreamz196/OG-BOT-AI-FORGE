import { useState } from "react";
import { Monitor, Tablet, Smartphone } from "lucide-react";
import { Panel, Btn } from "./ui";
import { cn } from "@/lib/utils";

const FILES: Record<string, string> = {
  "index.html": `<div class="app">
  <h1>Hello from OG-BOT</h1>
  <p>Edit the code — the preview updates live.</p>
  <button onclick="this.textContent='Clicked ✓'">Tap me</button>
</div>`,
  "style.css": `body{margin:0;font-family:system-ui;background:#0b0f1e;color:#e6e9f5}
.app{padding:32px;text-align:center}
h1{color:#fff;letter-spacing:.02em}
button{background:#3d5afe;color:#fff;border:0;padding:12px 20px;border-radius:6px;font-size:16px}`,
  "app.js": `console.log("OG-BOT preview ready");`,
};

const SIZES = { desktop: "100%", tablet: "768px", mobile: "375px" } as const;

export function Workbench() {
  const [files, setFiles] = useState(FILES);
  const [active, setActive] = useState("index.html");
  const [device, setDevice] = useState<keyof typeof SIZES>("desktop");
  const doc = `<!doctype html><html><head><style>${files["style.css"]}</style></head><body>${files["index.html"]}<script>${files["app.js"]}<\/script></body></html>`;

  return (
    <div className="grid h-full gap-3 lg:grid-cols-2">
      <Panel title="Code Editor" className="min-h-[520px]" right={<Btn variant="ghost" onClick={() => setFiles(FILES)}>Reset</Btn>}>
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
          </div>
        }
      >
        <div className="flex h-full justify-center overflow-auto rounded bg-muted/40 p-2">
          <iframe title="preview" sandbox="allow-scripts" srcDoc={doc} style={{ width: SIZES[device] }} className="h-full min-h-[440px] max-w-full rounded border border-border bg-background transition-all" />
        </div>
      </Panel>
    </div>
  );
}
