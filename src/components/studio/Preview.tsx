import { useState } from "react";
import {
  Monitor,
  Smartphone,
  Tablet,
  RefreshCw,
  Eye,
  Code2,
  Download,
  Rocket,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { buildDoc, useWorkspace, workspace } from "@/lib/workspace";
import { zipProject } from "./Workbench";
import { SECTIONS, insertSection } from "@/lib/web-sections";
import { usage } from "@/lib/usage";

const SIZES = { desktop: "100%", tablet: "768px", mobile: "390px" } as const;

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export function Preview({ onPublish }: { onPublish?: () => void }) {
  const { project, files, active } = useWorkspace();
  const [mode, setMode] = useState<"preview" | "code">("preview");
  const [device, setDevice] = useState<keyof typeof SIZES>("mobile");
  const [nonce, setNonce] = useState(0);
  const [zipping, setZipping] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const addSection = (id: string) => {
    const section = SECTIONS.find((s) => s.id === id);
    if (!section) return;
    workspace.writeFiles(insertSection(workspace.get().files, section));
    usage.record("edits");
    setAddOpen(false);
  };

  const exportZip = async () => {
    setZipping(true);
    try {
      const zip = await zipProject(project, files);
      download(await zip.generateAsync({ type: "blob", compression: "DEFLATE" }), `${project}.zip`);
    } finally {
      setZipping(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
          {(["preview", "code"] as const).map((mo) => (
            <button
              key={mo}
              onClick={() => setMode(mo)}
              className={cn(
                "flex items-center gap-1 rounded px-2.5 py-1 text-xs font-semibold capitalize transition",
                mode === mo
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {mo === "preview" ? (
                <Eye className="h-3.5 w-3.5" />
              ) : (
                <Code2 className="h-3.5 w-3.5" />
              )}
              {mo}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          {mode === "preview" &&
            (
              [
                ["desktop", Monitor],
                ["tablet", Tablet],
                ["mobile", Smartphone],
              ] as const
            ).map(([k, Icon]) => (
              <button
                key={k}
                aria-label={k}
                onClick={() => setDevice(k)}
                className={cn(
                  "rounded p-1.5",
                  device === k
                    ? "bg-secondary text-secondary-foreground"
                    : "text-muted-foreground hover:text-primary",
                )}
              >
                <Icon className="h-4 w-4" />
              </button>
            ))}
          <div className="relative">
            <button
              onClick={() => setAddOpen((o) => !o)}
              aria-label="Add section"
              aria-expanded={addOpen}
              className="flex items-center gap-1 rounded-lg border border-border px-2 py-1.5 text-xs font-semibold text-foreground transition hover:border-primary hover:text-primary"
            >
              <Plus className="h-3.5 w-3.5" /> Section
            </button>
            {addOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setAddOpen(false)} />
                <div className="absolute right-0 z-20 mt-1 max-h-72 w-48 overflow-y-auto rounded-xl border border-border bg-panel/95 p-1 shadow-xl backdrop-blur">
                  {SECTIONS.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => addSection(s.id)}
                      className="block w-full rounded px-3 py-2 text-left text-xs text-foreground transition hover:bg-primary/15 hover:text-primary"
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <button
            aria-label="Reload"
            onClick={() => setNonce((n) => n + 1)}
            className="rounded p-1.5 text-muted-foreground hover:text-primary"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          <button
            onClick={exportZip}
            disabled={zipping}
            className="rounded p-1.5 text-muted-foreground hover:text-primary disabled:opacity-40"
            aria-label="Export ZIP"
          >
            <Download className="h-4 w-4" />
          </button>
          <button
            onClick={onPublish}
            className="flex items-center gap-1 rounded-lg bg-secondary px-2.5 py-1.5 text-xs font-bold uppercase text-secondary-foreground transition hover:opacity-90"
          >
            <Rocket className="h-3.5 w-3.5" /> Publish
          </button>
        </div>
      </div>

      {/* body */}
      {mode === "preview" ? (
        <div className="flex flex-1 min-h-0 justify-center overflow-auto bg-muted/40 p-3">
          <iframe
            key={nonce}
            title="preview"
            sandbox="allow-scripts"
            srcDoc={buildDoc(files)}
            style={{ width: SIZES[device] }}
            className="h-full min-h-[480px] max-w-full rounded-xl border border-border bg-background shadow-xl transition-all"
          />
        </div>
      ) : (
        <div className="flex flex-1 min-h-0 flex-col p-3">
          <div className="mb-2 flex flex-wrap gap-1">
            {Object.keys(files).map((f) => (
              <button
                key={f}
                onClick={() => workspace.setActive(f)}
                className={cn(
                  "rounded-t px-3 py-1 font-mono text-xs",
                  active === f
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground",
                )}
              >
                {f}
              </button>
            ))}
          </div>
          <textarea
            spellCheck={false}
            value={files[active] ?? ""}
            onChange={(e) => workspace.writeFile(active, e.target.value)}
            className="flex-1 min-h-0 resize-none rounded border border-border bg-background p-3 font-mono text-xs leading-relaxed text-foreground outline-none focus:border-primary"
          />
        </div>
      )}
    </div>
  );
}
