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

  const iconBtn =
    "rounded-lg p-1.5 text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent";
  const doc = buildDoc(files);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* toolbar */}
      <div className="og-glass flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
        <div
          role="tablist"
          aria-label="Preview mode"
          className="og-hairline order-1 flex items-center gap-0.5 rounded-xl bg-background/40 p-1"
        >
          {(["preview", "code", "layout"] as const).map((mo) => (
            <button
              key={mo}
              role="tab"
              aria-selected={mode === mo}
              onClick={() => setMode(mo)}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition",
                mode === mo
                  ? "og-gradient text-primary-foreground shadow-md shadow-primary/25"
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
        <div className="order-3 flex flex-wrap items-center gap-1.5 max-sm:w-full sm:order-2">
          {mode === "preview" && (
            <div className="og-hairline flex items-center gap-0.5 rounded-xl bg-background/40 p-1 max-sm:hidden">
              {(
                [
                  ["desktop", Monitor],
                  ["tablet", Tablet],
                  ["mobile", Smartphone],
                ] as const
              ).map(([k, Icon]) => (
                <button
                  key={k}
                  aria-label={k}
                  title={k}
                  aria-pressed={device === k}
                  onClick={() => setDevice(k)}
                  className={cn(
                    "rounded-lg p-1.5 transition",
                    device === k
                      ? "bg-primary/20 text-primary"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                </button>
              ))}
            </div>
          )}
          <div className="og-hairline flex items-center gap-0.5 rounded-xl bg-background/40 p-1">
            <button
              aria-label="Undo last change"
              title="Undo last change (AI edit, section or typing)"
              disabled={!workspace.canUndo()}
              onClick={() => workspace.undo()}
              className={iconBtn}
            >
              <Undo2 className="h-4 w-4" />
            </button>
            <button
              aria-label="Redo"
              title="Redo"
              disabled={!workspace.canRedo()}
              onClick={() => workspace.redo()}
              className={iconBtn}
            >
              <Redo2 className="h-4 w-4" />
            </button>
            <span className="mx-0.5 h-4 w-px bg-border" aria-hidden />
            <div className="relative" ref={addRef}>
              <button
                onClick={() => setAddOpen((o) => !o)}
                aria-label="Add section"
                title="Add section"
                aria-expanded={addOpen}
                className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-foreground transition hover:bg-accent"
              >
                <Plus className="h-3.5 w-3.5" /> Section
              </button>
              {addOpen && (
                <div className="og-glass og-hairline absolute right-0 z-50 mt-2 max-h-72 w-52 overflow-y-auto rounded-xl p-1 shadow-2xl shadow-black/50">
                  {SECTIONS.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => addSection(s.id)}
                      className="block w-full rounded-lg px-3 py-2 text-left text-xs text-foreground transition hover:bg-primary/15 hover:text-primary"
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              aria-label="Reload"
              title="Reload preview"
              onClick={() => setNonce((n) => n + 1)}
              className={iconBtn}
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            <button
              onClick={exportZip}
              disabled={zipping}
              className={iconBtn}
              aria-label="Export ZIP"
              title="Download as ZIP"
            >
              <Download className="h-4 w-4" />
            </button>
          </div>
        </div>
        <button
          onClick={onPublish}
          className="og-gradient order-2 ml-auto flex items-center sm:order-3 sm:ml-0 gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold uppercase tracking-wider text-primary-foreground shadow-lg shadow-primary/30 transition hover:brightness-110"
        >
          <Rocket className="h-3.5 w-3.5" /> Publish
        </button>
      </div>

      {/* body */}
      {mode === "preview" ? (
        <div className="og-stage flex min-h-0 flex-1 justify-center overflow-auto p-2 sm:p-6">
          <DeviceFrame device={device} project={project}>
            <iframe
              key={nonce}
              title="preview"
              sandbox="allow-scripts allow-forms"
              srcDoc={doc}
              className="h-full w-full border-0 bg-background"
            />
          </DeviceFrame>
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
            className="og-hairline min-h-0 flex-1 resize-none rounded-xl border-0 bg-[#0a0d18] p-4 font-mono text-xs leading-relaxed text-foreground shadow-inner outline-none focus:ring-1 focus:ring-primary/60"
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

/** A browser window, tablet or phone around the live preview. */
function DeviceFrame({
  device,
  project,
  children,
}: {
  device: keyof typeof SIZES;
  project: string;
  children: React.ReactNode;
}) {
  if (device === "desktop") {
    return (
      <div className="og-hairline flex h-full min-h-[480px] w-full flex-col overflow-hidden rounded-2xl bg-panel shadow-2xl shadow-black/60 transition-all">
        <div className="flex items-center gap-3 border-b border-border/60 px-3 py-2">
          <span className="flex gap-1.5" aria-hidden>
            <i className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
            <i className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
            <i className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
          </span>
          <span className="mx-auto flex max-w-sm flex-1 items-center justify-center gap-1.5 truncate rounded-md bg-background/60 px-3 py-1 font-mono text-[10px] text-muted-foreground">
            <span className="text-success" aria-hidden>
              ●
            </span>
            {project}.preview
          </span>
          <span className="w-10" aria-hidden />
        </div>
        <div className="min-h-0 flex-1">{children}</div>
      </div>
    );
  }
  const phone = device === "mobile";
  return (
    <div
      style={{ width: SIZES[device] }}
      className={cn(
        "relative h-full max-h-[900px] min-h-[480px] max-w-full shrink-0 bg-gradient-to-b from-[#2a2f45] to-[#141827] p-2.5 shadow-2xl shadow-black/70 ring-1 ring-white/10 transition-all max-sm:!w-full max-sm:max-h-none max-sm:rounded-2xl max-sm:bg-none max-sm:p-0",
        phone ? "rounded-[2.6rem]" : "rounded-[1.8rem]",
      )}
    >
      {phone && (
        <span
          className="absolute left-1/2 top-4 z-10 h-5 w-24 -translate-x-1/2 rounded-full bg-black max-sm:hidden"
          aria-hidden
        />
      )}
      <div
        className={cn(
          "h-full overflow-hidden bg-background max-sm:rounded-2xl",
          phone ? "rounded-[2.1rem]" : "rounded-[1.3rem]",
        )}
      >
        {children}
      </div>
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
