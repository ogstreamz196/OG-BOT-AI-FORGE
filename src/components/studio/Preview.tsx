import { useEffect, useRef, useState } from "react";
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
  Layers,
  ArrowUp,
  ArrowDown,
  Copy,
  Trash2,
  Undo2,
  Redo2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { buildDoc, useWorkspace, workspace } from "@/lib/workspace";
import { zipProject } from "./Workbench";
import { SECTIONS, insertSection } from "@/lib/web-sections";
import { parseBlocks, moveBlock, duplicateBlock, removeBlock } from "@/lib/web-blocks";
import { usage } from "@/lib/usage";

const LABEL_BY_ID: Record<string, string> = Object.fromEntries(
  SECTIONS.map((s) => [s.id, s.label]),
);

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
  const [mode, setMode] = useState<"preview" | "code" | "layout">("preview");
  const [device, setDevice] = useState<keyof typeof SIZES>("mobile");
  const [nonce, setNonce] = useState(0);
  const [zipping, setZipping] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const addRef = useRef<HTMLDivElement>(null);

  // Close the Add-section dropdown on an outside click (no intercepting overlay).
  useEffect(() => {
    if (!addOpen) return;
    const onDown = (e: MouseEvent) => {
      if (addRef.current && !addRef.current.contains(e.target as Node)) setAddOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [addOpen]);

  const addSection = (id: string) => {
    const section = SECTIONS.find((s) => s.id === id);
    if (!section) return;
    workspace.writeFiles(insertSection(workspace.get().files, section));
    usage.record("edits");
    setAddOpen(false);
  };

  const editHtml = (fn: (html: string) => string) => {
    workspace.writeFile("index.html", fn(workspace.get().files["index.html"] ?? ""));
    usage.record("edits");
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
          {(["preview", "code", "layout"] as const).map((mo) => (
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
              ) : mo === "code" ? (
                <Code2 className="h-3.5 w-3.5" />
              ) : (
                <Layers className="h-3.5 w-3.5" />
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
          <button
            aria-label="Undo last change"
            title="Undo last change (AI edit, section or typing)"
            disabled={!workspace.canUndo()}
            onClick={() => workspace.undo()}
            className="rounded p-1.5 text-muted-foreground transition hover:text-primary disabled:opacity-30"
          >
            <Undo2 className="h-4 w-4" />
          </button>
          <button
            aria-label="Redo"
            title="Redo"
            disabled={!workspace.canRedo()}
            onClick={() => workspace.redo()}
            className="rounded p-1.5 text-muted-foreground transition hover:text-primary disabled:opacity-30"
          >
            <Redo2 className="h-4 w-4" />
          </button>
          <div className="relative" ref={addRef}>
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
                <div className="absolute right-0 z-50 mt-1 max-h-72 w-48 overflow-y-auto rounded-xl border border-border bg-panel/95 p-1 shadow-xl backdrop-blur">
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
            sandbox="allow-scripts allow-forms"
            srcDoc={buildDoc(files)}
            style={{ width: SIZES[device] }}
            className="h-full min-h-[480px] max-w-full rounded-xl border border-border bg-background shadow-xl transition-all"
          />
        </div>
      ) : mode === "code" ? (
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
      ) : (
        <LayoutManager
          html={files["index.html"] ?? ""}
          onAdd={() => setAddOpen(true)}
          onEdit={editHtml}
        />
      )}
    </div>
  );
}

function LayoutManager({
  html,
  onAdd,
  onEdit,
}: {
  html: string;
  onAdd: () => void;
  onEdit: (fn: (html: string) => string) => void;
}) {
  const blocks = parseBlocks(html);
  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {blocks.length} section{blocks.length === 1 ? "" : "s"} · drag-free reorder
        </span>
        <button
          onClick={onAdd}
          className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold hover:border-primary hover:text-primary"
        >
          <Plus className="h-3.5 w-3.5" /> Add section
        </button>
      </div>
      {blocks.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No sections yet. Use <span className="text-foreground">Add section</span> or ask the chat
          to "add a hero".
        </p>
      ) : (
        <ol className="space-y-2">
          {blocks.map((b, i) => (
            <li
              key={`${b.id}-${i}`}
              className="flex items-center justify-between gap-2 rounded-xl border border-border bg-card px-3 py-2"
            >
              <span className="flex items-center gap-2 text-sm text-foreground">
                <span className="font-mono text-[11px] text-muted-foreground">{i + 1}</span>
                {LABEL_BY_ID[b.id] ?? b.id}
              </span>
              <span className="flex items-center gap-0.5">
                <IconAction
                  label="Move up"
                  disabled={i === 0}
                  onClick={() => onEdit((h) => moveBlock(h, i, "up"))}
                >
                  <ArrowUp className="h-4 w-4" />
                </IconAction>
                <IconAction
                  label="Move down"
                  disabled={i === blocks.length - 1}
                  onClick={() => onEdit((h) => moveBlock(h, i, "down"))}
                >
                  <ArrowDown className="h-4 w-4" />
                </IconAction>
                <IconAction label="Duplicate" onClick={() => onEdit((h) => duplicateBlock(h, i))}>
                  <Copy className="h-4 w-4" />
                </IconAction>
                <IconAction label="Remove" danger onClick={() => onEdit((h) => removeBlock(h, i))}>
                  <Trash2 className="h-4 w-4" />
                </IconAction>
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function IconAction({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "rounded p-1.5 transition disabled:opacity-30",
        danger
          ? "text-muted-foreground hover:text-destructive"
          : "text-muted-foreground hover:text-primary",
      )}
    >
      {children}
    </button>
  );
}
