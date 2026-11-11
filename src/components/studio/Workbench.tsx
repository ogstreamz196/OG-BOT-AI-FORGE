import { useState } from "react";
import { Monitor, Tablet, Smartphone } from "lucide-react";
import { Panel, Btn } from "./ui";
import { cn } from "@/lib/utils";
import { buildDoc, standaloneIndex, useWorkspace, workspace, type Files } from "@/lib/workspace";

const SIZES = { desktop: "100%", tablet: "768px", mobile: "375px" } as const;

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

/**
 * Multi-file ZIP archive of the project: index.html (as a full document linking
 * styles.css/app.js), every other file as-is, plus bundle.html (single-file build).
 */
export async function zipProject(project: string, files: Files) {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const dir = zip.folder(project)!;
  for (const [name, content] of Object.entries(files)) {
    dir.file(name, name === "index.html" ? standaloneIndex(files) : content);
  }
  dir.file("bundle.html", buildDoc(files));
  return zip;
}

export function Workbench() {
  const { project, files, active } = useWorkspace();
  const [device, setDevice] = useState<keyof typeof SIZES>("desktop");
  const [nonce, setNonce] = useState(0);

  const [zipping, setZipping] = useState(false);
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
    <div className="grid h-full gap-3 lg:grid-cols-2">
      <Panel
        title="Code Editor"
        className="min-h-[520px]"
        right={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <select aria-label="Project" value={project} onChange={(e) => workspace.open(e.target.value)} className="rounded border border-border bg-background px-2 py-1 font-mono text-xs text-foreground">
              {workspace.projectNames().map((p) => <option key={p}>{p}</option>)}
            </select>
            <Btn variant="ghost" disabled={!workspace.canUndo()} onClick={() => workspace.undo()}>Undo</Btn>
            <Btn variant="ghost" disabled={!workspace.canRedo()} onClick={() => workspace.redo()}>Redo</Btn>
            <Btn variant="ghost" onClick={() => workspace.reset()}>Reset</Btn>
            <Btn variant="ghost" onClick={() => download(new Blob([buildDoc(files)], { type: "text/html" }), `${project}.html`)}>Export HTML</Btn>
            <Btn variant="ghost" onClick={exportZip} disabled={zipping}>{zipping ? "Zipping…" : "Export ZIP"}</Btn>
          </div>
        }
      >
        <div className="flex h-full flex-col">
          <div className="mb-2 flex gap-1">
            {Object.keys(files).map((f) => (
              <button key={f} onClick={() => workspace.setActive(f)} className={cn("rounded-t px-3 py-1 font-mono text-xs", active === f ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground")}>{f}</button>
            ))}
          </div>
          <textarea
            spellCheck={false}
            value={files[active] ?? ""}
            onChange={(e) => workspace.writeFile(active, e.target.value)}
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
          <iframe key={nonce} title="preview" sandbox="allow-scripts allow-forms" srcDoc={buildDoc(files)} style={{ width: SIZES[device] }} className="h-full min-h-[440px] max-w-full rounded border border-border bg-background transition-all" />
        </div>
      </Panel>
    </div>
  );
}
