import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
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
  RotateCw,
  Ruler,
  GripVertical,
  Pencil,
  X,
  Globe,
  Apple,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { buildDoc, useWorkspace, workspace } from "@/lib/workspace";
import { zipProject } from "./Workbench";
import { SECTIONS, insertSection } from "@/lib/web-sections";
import {
  parseBlocks,
  moveBlock,
  moveBlockTo,
  duplicateBlock,
  removeBlock,
  blockInner,
  replaceBlock,
} from "@/lib/web-blocks";
import { usage } from "@/lib/usage";
import { usePersistentState } from "@/hooks/use-persistent-state";

const CodeEditor = lazy(() => import("./CodeEditor"));

const LABEL_BY_ID: Record<string, string> = Object.fromEntries(
  SECTIONS.map((s) => [s.id, s.label]),
);

type Device = "desktop" | "tablet" | "mobile" | "custom";
/** Portrait sizes (CSS px) of the frames. */
const DIMS: Record<Exclude<Device, "desktop">, { w: number; h: number }> = {
  tablet: { w: 768, h: 1024 },
  mobile: { w: 390, h: 844 },
  custom: { w: 1024, h: 768 },
};

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

/** A tiny live render of some HTML (section thumbnails), scaled to fit its box. */
function Thumb({ html, css, className }: { html: string; css: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.1);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => setScale(Math.max(0.05, el.clientWidth / 1040));
    fit();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} className={cn("pointer-events-none relative overflow-hidden rounded-md bg-[#0b0f1e]", className)} aria-hidden>
      <iframe
        tabIndex={-1}
        title=""
        sandbox=""
        srcDoc={`<style>body{margin:0;background:#0b0f1e;color:#e6e9f5;font-family:system-ui}${css}</style>${html}`}
        className="absolute left-0 top-0 origin-top-left border-0"
        style={{ width: 1040, height: 1040, transform: `scale(${scale})` }}
      />
    </div>
  );
}

export function Preview({ onPublish }: { onPublish?: () => void }) {
  const { project, files, active } = useWorkspace();
  const [mode, setMode] = useState<"preview" | "code" | "layout">("preview");
  const [device, setDevice] = usePersistentState<Device>("og-preview-device", "mobile");
  const [landscape, setLandscape] = usePersistentState("og-preview-landscape", false);
  const [customW, setCustomW] = usePersistentState("og-preview-custom-w", 1024);
  const [nonce, setNonce] = useState(0);
  const [zipping, setZipping] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [address, setAddress] = usePersistentState<Record<string, string>>("og-site-address", {});
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
  const siteAddress = address[project] ?? "";

  return (
    <div className="relative flex h-full min-h-0 flex-col">
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
                  ["desktop", Monitor, "Desktop"],
                  ["tablet", Tablet, "Tablet"],
                  ["mobile", Smartphone, "Phone"],
                  ["custom", Ruler, "Custom width"],
                ] as const
              ).map(([k, Icon, label]) => (
                <button
                  key={k}
                  aria-label={label}
                  title={label}
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
              {device === "custom" && (
                <label className="flex items-center gap-1 px-1 font-mono text-[11px] text-muted-foreground">
                  <input
                    aria-label="Custom width in pixels"
                    type="number"
                    min={280}
                    max={2560}
                    step={10}
                    value={customW}
                    onChange={(e) =>
                      setCustomW(Math.min(2560, Math.max(280, Number(e.target.value) || 280)))
                    }
                    className="w-16 rounded border border-border bg-background px-1 py-0.5 text-foreground"
                  />
                  px
                </label>
              )}
              <span className="mx-0.5 h-4 w-px bg-border" aria-hidden />
              <button
                aria-label="Rotate"
                title={landscape ? "Back to portrait" : "Rotate to landscape"}
                aria-pressed={landscape}
                disabled={device === "desktop" || device === "custom"}
                onClick={() => setLandscape(!landscape)}
                className={cn(iconBtn, landscape && "text-primary")}
              >
                <RotateCw className="h-4 w-4" />
              </button>
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
                <div className="og-glass og-hairline absolute right-0 z-50 mt-2 grid max-h-[70vh] w-[min(22rem,calc(100vw-2rem))] grid-cols-2 gap-1.5 overflow-y-auto rounded-xl p-2 shadow-2xl shadow-black/50">
                  {SECTIONS.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => addSection(s.id)}
                      className="group rounded-lg p-1 text-left transition hover:bg-primary/15"
                    >
                      <Thumb html={s.html} css={s.css} className="aspect-[13/8] w-full" />
                      <span className="mt-1 block px-1 text-[11px] text-foreground group-hover:text-primary">
                        {s.label}
                      </span>
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
          onClick={() => setPublishOpen(true)}
          className="og-gradient order-2 ml-auto flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold uppercase tracking-wider text-primary-foreground shadow-lg shadow-primary/30 transition hover:brightness-110 sm:order-3 sm:ml-0"
        >
          <Rocket className="h-3.5 w-3.5" /> Publish
        </button>
      </div>

      {/* body */}
      {mode === "preview" ? (
        <Stage
          device={device}
          landscape={landscape}
          customW={customW}
          project={project}
          address={siteAddress}
        >
          <iframe
            key={nonce}
            title="preview"
            sandbox="allow-scripts allow-forms"
            srcDoc={doc}
            className="h-full w-full border-0 bg-background"
          />
        </Stage>
      ) : mode === "code" ? (
        <div className="flex min-h-0 flex-1 flex-col p-3">
          <div className="mb-2 flex flex-wrap gap-1" role="tablist" aria-label="Files">
            {Object.keys(files).map((f) => (
              <button
                key={f}
                role="tab"
                aria-selected={active === f}
                onClick={() => workspace.setActive(f)}
                className={cn(
                  "rounded-lg px-3 py-1 font-mono text-xs transition",
                  active === f
                    ? "og-gradient text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground",
                )}
              >
                {f}
              </button>
            ))}
          </div>
          <div className="og-hairline min-h-0 flex-1 overflow-hidden rounded-xl bg-[#282c34]">
            <Suspense
              fallback={
                <p className="p-4 font-mono text-xs text-muted-foreground">Loading editor…</p>
              }
            >
              <CodeEditor
                key={`${project}/${active}`}
                name={active}
                value={files[active] ?? ""}
                onChange={(v) => workspace.writeFile(active, v)}
              />
            </Suspense>
          </div>
        </div>
      ) : (
        <LayoutManager
          html={files["index.html"] ?? ""}
          css={files["styles.css"] ?? ""}
          onAdd={() => setAddOpen(true)}
          onEdit={editHtml}
        />
      )}

      {publishOpen && (
        <PublishSheet
          project={project}
          address={siteAddress}
          onAddress={(a) => setAddress({ ...address, [project]: a })}
          onClose={() => setPublishOpen(false)}
          onGo={(target) => {
            try {
              sessionStorage.setItem("og-publish-target", target);
            } catch {
              /* private mode */
            }
            setPublishOpen(false);
            onPublish?.();
          }}
        />
      )}
    </div>
  );
}

/** The preview stage: fits the device frame to the space (zoom-to-fit) and shows the zoom level. */
function Stage({
  device,
  landscape,
  customW,
  project,
  address,
  children,
}: {
  device: Device;
  landscape: boolean;
  customW: number;
  project: string;
  address: string;
  children: React.ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setRoom({ w: el.clientWidth - 32, h: el.clientHeight - 32 });
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const narrow = room.w > 0 && room.w < 440;
  if (device === "desktop" || narrow) {
    return (
      <div
        ref={box}
        className="og-stage flex min-h-0 flex-1 justify-center overflow-auto p-2 sm:p-6"
      >
        {device === "desktop" ? (
          <BrowserFrame project={project} address={address}>
            {children}
          </BrowserFrame>
        ) : (
          <div className="h-full min-h-[480px] w-full overflow-hidden rounded-2xl bg-background">
            {children}
          </div>
        )}
      </div>
    );
  }
  const base = device === "custom" ? { w: customW, h: Math.max(480, room.h || 768) } : DIMS[device];
  const dims = landscape && device !== "custom" ? { w: base.h, h: base.w } : base;
  const bezel = device === "custom" ? 0 : 20;
  const fw = dims.w + bezel;
  const fh = dims.h + bezel;
  const scale = room.w && room.h ? Math.min(1, room.w / fw, room.h / fh) : 1;
  const phone = device === "mobile";
  return (
    <div
      ref={box}
      className="og-stage relative flex min-h-0 flex-1 items-start justify-center overflow-hidden p-4"
    >
      <div style={{ width: fw * scale, height: fh * scale }} className="shrink-0">
        <div
          style={{ width: fw, height: fh, transform: `scale(${scale})` }}
          className={cn(
            "relative origin-top-left shadow-2xl shadow-black/70 transition-transform",
            device === "custom"
              ? "og-hairline overflow-hidden rounded-xl bg-background"
              : cn(
                  "bg-gradient-to-b from-[#2a2f45] to-[#141827] p-2.5 ring-1 ring-white/10",
                  phone
                    ? landscape
                      ? "rounded-[2.6rem]"
                      : "rounded-[2.6rem]"
                    : "rounded-[1.8rem]",
                ),
          )}
        >
          {phone && !landscape && (
            <span
              className="absolute left-1/2 top-4 z-10 h-5 w-24 -translate-x-1/2 rounded-full bg-black"
              aria-hidden
            />
          )}
          <div
            className={cn(
              "h-full overflow-hidden bg-background",
              device === "custom" ? "" : phone ? "rounded-[2.1rem]" : "rounded-[1.3rem]",
            )}
          >
            {children}
          </div>
        </div>
      </div>
      <span
        className="absolute bottom-2 right-3 rounded-full bg-background/70 px-2 py-0.5 font-mono text-[10px] text-muted-foreground"
        aria-live="polite"
      >
        {dims.w}×{dims.h} · {Math.round(scale * 100)}%
      </span>
    </div>
  );
}

function BrowserFrame({
  project,
  address,
  children,
}: {
  project: string;
  address: string;
  children: React.ReactNode;
}) {
  return (
    <div className="og-hairline flex h-full min-h-[480px] w-full flex-col overflow-hidden rounded-2xl bg-panel shadow-2xl shadow-black/60 transition-all">
      <div className="flex items-center gap-3 border-b border-border/60 px-3 py-2">
        <span className="flex gap-1.5" aria-hidden>
          <i className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
          <i className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
          <i className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
        </span>
        <span className="mx-auto flex max-w-md flex-1 items-center justify-center gap-1.5 truncate rounded-md bg-background/60 px-3 py-1 font-mono text-[10px] text-muted-foreground">
          <span className={address ? "text-success" : "text-muted-foreground"} aria-hidden>
            ●
          </span>
          {address ? (
            <a
              href={address}
              target="_blank"
              rel="noreferrer"
              className="truncate hover:text-primary"
            >
              {address.replace(/^https?:\/\//, "")} <ExternalLink className="inline h-2.5 w-2.5" />
            </a>
          ) : (
            <span className="truncate">{project} · not published yet</span>
          )}
        </span>
        <span className="w-10" aria-hidden />
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}

const TARGETS = [
  {
    id: "web",
    icon: Globe,
    title: "Website",
    body: "Puts the site online. Builds on GitHub Actions in your repo.",
    needs: "GitHub connected (Connectors)",
  },
  {
    id: "android",
    icon: Smartphone,
    title: "Android app",
    body: "An installable APK, ready to sideload or share.",
    needs: "GitHub connected · about 5 minutes",
  },
  {
    id: "ios",
    icon: Apple,
    title: "iPhone app",
    body: "An unsigned iOS build to sign in Xcode.",
    needs: "GitHub connected · signing needs a Mac",
  },
] as const;

/** Guided publish: pick where it goes, see what's needed, then open Build & Publish ready to go. */
function PublishSheet({
  project,
  address,
  onAddress,
  onClose,
  onGo,
}: {
  project: string;
  address: string;
  onAddress: (a: string) => void;
  onClose: () => void;
  onGo: (target: string) => void;
}) {
  const [target, setTarget] = useState<string>("web");
  const [addr, setAddr] = useState(address);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div
      className="absolute inset-0 z-40 flex items-end justify-center bg-black/50 p-3 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Publish"
        onClick={(e) => e.stopPropagation()}
        className="og-glass og-hairline w-full max-w-lg rounded-2xl p-4 shadow-2xl shadow-black/60"
      >
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="og-eyebrow">Publish</p>
            <h3 className="font-brand text-lg font-semibold">Where should {project} go?</h3>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-2" role="radiogroup" aria-label="Publish target">
          {TARGETS.map((t) => (
            <button
              key={t.id}
              role="radio"
              aria-checked={target === t.id}
              onClick={() => setTarget(t.id)}
              className={cn(
                "flex w-full items-start gap-3 rounded-xl border p-3 text-left transition",
                target === t.id
                  ? "border-primary bg-primary/10"
                  : "border-border hover:border-primary/60",
              )}
            >
              <t.icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{t.title}</span>
                <span className="block text-xs text-muted-foreground">{t.body}</span>
                <span className="mt-1 block text-[11px] text-foreground/70">Needs: {t.needs}</span>
              </span>
            </button>
          ))}
        </div>
        {target === "web" && (
          <label className="mt-3 block text-xs text-muted-foreground">
            Site address once it's live (optional, shows in the preview's address bar)
            <input
              value={addr}
              onChange={(e) => setAddr(e.target.value.trim())}
              placeholder="https://mysite.example"
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
            />
          </label>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-xl border border-border px-4 py-2 text-xs font-semibold"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              if (addr !== address)
                onAddress(/^https?:\/\//.test(addr) || !addr ? addr : `https://${addr}`);
              onGo(target);
            }}
            className="og-gradient rounded-xl px-4 py-2 text-xs font-bold uppercase tracking-wider text-primary-foreground"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}

function LayoutManager({
  html,
  css,
  onAdd,
  onEdit,
}: {
  html: string;
  css: string;
  onAdd: () => void;
  onEdit: (fn: (html: string) => string) => void;
}) {
  const blocks = parseBlocks(html);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {blocks.length} section{blocks.length === 1 ? "" : "s"} · drag to reorder
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
              draggable={editing === null}
              onDragStart={(e) => {
                setDragFrom(i);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(e) => {
                if (dragFrom === null) return;
                e.preventDefault();
                setOver(i);
              }}
              onDragLeave={() => setOver((o) => (o === i ? null : o))}
              onDrop={(e) => {
                e.preventDefault();
                if (dragFrom !== null && dragFrom !== i) onEdit((h) => moveBlockTo(h, dragFrom, i));
                setDragFrom(null);
                setOver(null);
              }}
              onDragEnd={() => {
                setDragFrom(null);
                setOver(null);
              }}
              className={cn(
                "og-hairline rounded-xl bg-card/70 p-2 transition",
                dragFrom === i && "opacity-40",
                over === i && dragFrom !== i && "ring-2 ring-primary",
              )}
            >
              <div className="flex items-center gap-2">
                <GripVertical
                  className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground"
                  aria-hidden
                />
                <Thumb html={blockInner(b.full)} css={css} className="h-14 w-24 shrink-0" />
                <span className="min-w-0 flex-1 text-sm text-foreground">
                  <span className="mr-1.5 font-mono text-[11px] text-muted-foreground">
                    {i + 1}
                  </span>
                  {LABEL_BY_ID[b.id] ?? b.id}
                </span>
                <span className="flex shrink-0 items-center gap-0.5">
                  <IconAction
                    label="Edit"
                    onClick={() => {
                      setEditing(editing === i ? null : i);
                      setDraft(blockInner(b.full));
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </IconAction>
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
                  <IconAction
                    label="Remove"
                    danger
                    onClick={() => onEdit((h) => removeBlock(h, i))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </IconAction>
                </span>
              </div>
              {editing === i && (
                <div className="mt-2 space-y-2">
                  <div className="h-56 overflow-hidden rounded-lg bg-[#282c34]">
                    <Suspense
                      fallback={
                        <p className="p-3 font-mono text-xs text-muted-foreground">
                          Loading editor…
                        </p>
                      }
                    >
                      <CodeEditor name="section.html" value={draft} onChange={setDraft} />
                    </Suspense>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setEditing(null)}
                      className="rounded-lg border border-border px-3 py-1.5 text-xs"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        onEdit((h) => replaceBlock(h, i, draft));
                        setEditing(null);
                      }}
                      className="og-gradient rounded-lg px-3 py-1.5 text-xs font-semibold text-primary-foreground"
                    >
                      Save section
                    </button>
                  </div>
                </div>
              )}
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
