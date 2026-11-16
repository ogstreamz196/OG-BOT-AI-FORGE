import { useEffect, useRef, useState } from "react";
import { usePersistentState } from "@/hooks/use-persistent-state";
import {
  Send,
  Sparkles,
  Cpu,
  Square,
  Undo2,
  Eye,
  ImagePlus,
  X,
  Plus,
  FileCode2,
} from "lucide-react";
import { inputCls } from "./ui";
import { Md } from "./Md";
import { cn } from "@/lib/utils";
import { slashReply } from "./Agent";
import { planEdit } from "@/lib/agent-edits";
import { workspace, useWorkspace, type Files } from "@/lib/workspace";
import { usage } from "@/lib/usage";
import { models, useModels } from "@/lib/models";
import { connectors } from "@/lib/connectors";
import { buildHandoff } from "@/lib/build-handoff";
import { describeImage, generateEdit, pingOllama, quickChat } from "@/lib/local-ai";
import { permissions } from "@/lib/permissions";
import { brain } from "@/lib/brain";
import { dispatch, overLimit } from "@/lib/orchestrator";
import {
  diffHunks,
  lineDiff,
  makeEdit,
  trimEdits,
  undoPatch,
  type EditRecord,
} from "@/lib/chat-edits";

export type Msg = {
  role: "you" | "ai" | "sys";
  text: string;
  /** The change this message made, so it can be viewed and undone. */
  edit?: EditRecord;
  editTrimmed?: boolean;
  undone?: boolean;
  /** Step-by-step notes behind an edit (shown folded). */
  log?: string[];
};

/** Quick asks: what the chip says → what OG BOT is asked. */
const SUGGESTIONS: [string, string][] = [
  ["Start a landing page", "/scaffold mysite landing"],
  ["Add a hero", "Add a hero"],
  ["Add a features grid", "Add a features grid"],
  ["Add a pricing table", "Add a pricing table"],
  ["Add a contact form", "Add a contact form"],
  ["Add a footer", "Add a footer"],
  ["Dark mode toggle", "Add a dark mode toggle"],
  ["Title: OG BOT", "Set the title to OG BOT"],
];

const CHAT_GREETING: Msg[] = [
  {
    role: "sys",
    text: "OG BOT here, powering your OFFLINE FORGE · 100% offline. Describe a change and I'll edit your app; the preview updates live.",
  },
];

const VISION_RE = /vision|llava|moondream|bakllava|minicpm-v/i;

/** One edit as a card: what changed, View changes, Undo this edit. */
function EditCard({ msg, onUndo }: { msg: Msg; onUndo: () => void }) {
  const [open, setOpen] = useState(false);
  const e = msg.edit;
  const names = e ? Object.keys(e.files) : [];
  return (
    <div className="mt-2 rounded-xl border border-border/70 bg-background/50 p-2 text-xs">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
          <FileCode2 className="h-3.5 w-3.5 shrink-0 text-primary" />
          <span className="truncate">{names.join(", ") || "files"}</span>
          {e && (
            <span className="font-mono">
              <span className="text-success">+{e.added}</span>{" "}
              <span className="text-destructive">−{e.removed}</span>
            </span>
          )}
        </span>
        {msg.undone ? (
          <span className="ml-auto text-muted-foreground">undone</span>
        ) : (
          <span className="ml-auto flex gap-3">
            {e && (
              <button
                onClick={() => setOpen(!open)}
                className="flex items-center gap-1 text-primary hover:underline"
              >
                <Eye className="h-3 w-3" />
                {open ? "Hide changes" : "View changes"}
              </button>
            )}
            {e && (
              <button
                onClick={onUndo}
                className="flex items-center gap-1 text-destructive hover:underline"
              >
                <Undo2 className="h-3 w-3" />
                Undo this edit
              </button>
            )}
          </span>
        )}
      </div>
      {msg.editTrimmed && !e && (
        <p className="mt-1 text-[11px] text-muted-foreground">
          Older edit: use Undo in the preview toolbar to step back.
        </p>
      )}
      {open && e && (
        <div className="mt-2 max-h-72 space-y-2 overflow-auto">
          {names.map((n) => (
            <div key={n}>
              <div className="mb-0.5 font-mono text-[10px] text-muted-foreground">{n}</div>
              <pre className="rounded-lg bg-[#0a0d18] p-2 font-mono text-[10px] leading-relaxed">
                {diffHunks(lineDiff(e.files[n]!.before, e.files[n]!.after)).map((l, i) => (
                  <span
                    key={i}
                    className={cn(
                      "block whitespace-pre-wrap",
                      l.t === "add" && "bg-success/10 text-success",
                      l.t === "del" && "bg-destructive/10 text-destructive",
                      l.t === "gap" && "text-muted-foreground/70 italic",
                    )}
                  >
                    {l.t === "add" ? "+ " : l.t === "del" ? "- " : l.t === "gap" ? "" : "  "}
                    {l.s}
                  </span>
                ))}
              </pre>
            </div>
          ))}
        </div>
      )}
      {msg.log && msg.log.length > 0 && (
        <details className="mt-1 text-[11px] text-muted-foreground">
          <summary className="cursor-pointer">Steps</summary>
          <ul className="mt-1 list-disc pl-4">
            {msg.log.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

export function Chat() {
  const ws = useWorkspace();
  const m = useModels(); // re-render when the live model list / active model changes
  const activeTag = models.activeTag();
  // One conversation per project, saved in this browser.
  const [msgs, setMsgs] = usePersistentState<Msg[]>(`og-chat-v2:${ws.project}`, CHAT_GREETING);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [image, setImage] = useState<{ name: string; b64: string; url: string } | null>(null);
  const [newProject, setNewProject] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [msgs]);

  // Learn what's actually installed on the local engine as soon as it's
  // connected, so the header and default model reflect reality (not the manual
  // catalog). Re-checks when the Ollama connector config changes.
  useEffect(() => {
    let cancelled = false;
    const sync = async () => {
      const base = connectors.isEnabled("ollama") ? connectors.configOf("ollama")["baseUrl"] : null;
      if (!base) return;
      const health = await pingOllama(base);
      if (!cancelled && health.ok) models.syncLive(health.models);
    };
    void sync();
    const unsub = connectors.subscribe(() => void sync());
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  const push = (msg: Msg) => setMsgs((l) => trimEdits([...l, msg].slice(-300)));

  const stream = (lines: string[]) => {
    if (lines.length === 0) {
      setBusy(false);
      return;
    }
    lines.forEach((line, i) => {
      setTimeout(
        () => {
          push({ role: "ai", text: line });
          if (i === lines.length - 1) setBusy(false);
        },
        55 * (i + 1),
      );
    });
  };

  /** Apply a change and post it as one reviewable, undoable message. */
  const apply = (patch: Files, text: string, log?: string[]) => {
    const edit = makeEdit(workspace.get().files, patch);
    if (edit) {
      workspace.writeFiles(patch);
      usage.record("edits");
    }
    push({
      role: "ai",
      text: edit ? text : `${text} (nothing needed changing)`,
      ...(edit ? { edit } : {}),
      ...(log?.length ? { log } : {}),
    });
  };

  const undo = (i: number) => {
    const msg = msgs[i];
    if (!msg?.edit) return;
    const { patch, changedSince } = undoPatch(msg.edit, workspace.get().files);
    if (
      changedSince.length &&
      !window.confirm(
        `${changedSince.join(", ")} changed after this edit. Undo it anyway? Later changes to those files will be replaced.`,
      )
    )
      return;
    workspace.writeFiles(patch);
    setMsgs((l) => [
      ...l.map((x, j) => (j === i ? { ...x, undone: true } : x)),
      {
        role: "sys" as const,
        text: `Undid an edit to ${Object.keys(msg.edit!.files).join(", ")}.`,
      },
    ]);
  };

  const ruleEngine = (text: string, note?: string) => {
    const { patch, log } = planEdit(workspace.get().files, text);
    const summary = log.at(-1) ?? "Done.";
    apply(patch, note ? `${note}\n\n${summary}` : summary, log.slice(0, -1));
    setBusy(false);
  };

  const stop = () => {
    abortRef.current?.abort();
  };

  const pickImage = (f: File | undefined) => {
    if (!f || !f.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result);
      setImage({ name: f.name, url, b64: url.replace(/^data:[^,]+,/, "") });
    };
    reader.readAsDataURL(f);
  };

  const run = async (raw?: string) => {
    const text = (raw ?? q).trim();
    if (!text || busy) return;
    const shot = image;
    push({ role: "you", text: shot ? `${text}\n\n(attached: ${shot.name})` : text });
    setQ("");
    setImage(null);
    setBusy(true);
    usage.record("prompts");

    // Slash commands are always handled locally.
    if (text.startsWith("/")) {
      const lines = slashReply(text);
      stream(
        lines ?? [
          `Unknown command "${text.split(" ")[0]}". Try /scaffold or just describe a change.`,
        ],
      );
      return;
    }

    const ollama = connectors.isEnabled("ollama") ? connectors.configOf("ollama")["baseUrl"] : null;
    if (!ollama) {
      // No local AI: deterministic offline rule engine.
      ruleEngine(
        text,
        shot
          ? "Screenshots need the AI engine on your drive; I made the change from your words only."
          : undefined,
      );
      return;
    }

    const ctl = new AbortController();
    abortRef.current = ctl;
    try {
      const b = brain.get();
      let model = models.activeTag() ?? "qwen2.5-coder:14b";
      let context: string | undefined;

      if (shot) {
        const vision = models.get().live.find((t) => VISION_RE.test(t) && !overLimit(t));
        if (vision) {
          push({ role: "ai", text: `Looking at your screenshot with ${vision}…` });
          context = await describeImage(ollama, vision, shot.b64, ctl.signal).catch(
            () => undefined,
          );
        } else {
          push({
            role: "ai",
            text: "To read screenshots, install **Llama 3.2 Vision 11B** in Settings → AI models. Going from your words for now.",
          });
        }
      }

      if (b.smartRoute) {
        // Smart routing (opt-in): a live dispatcher picks a specialist model and
        // may chain reason→build. Slower (extra model calls), higher quality.
        const orchestrate = await permissions.request("orchestrate");
        if (orchestrate) {
          const health = await pingOllama(ollama);
          if (health.ok) models.syncLive(health.models);
          const installed = health.models.length ? health.models : model ? [model] : [];
          const plan = await dispatch(
            text,
            installed,
            (mm, p) => quickChat(ollama, mm, p, undefined, ctl.signal),
            {
              allowChain: b.chain,
              routerModel: b.routerModel || null,
              byName: b.routeByName,
            },
          );
          const { kind, steps } = plan;
          const build = steps.find((st) => st.role === "build");
          const reason = steps.find((st) => st.role === "reason");
          if (build) model = build.model;
          if (plan.routed && plan.router) {
            const how = plan.byName ? "named" : kind;
            push({ role: "ai", text: `Router (${plan.router}) → ${how} · ${model}` });
          }
          if (reason) {
            push({ role: "ai", text: `Reasoning with ${reason.model}…` });
            const planText = await quickChat(
              ollama,
              reason.model,
              `Task: ${text}\nGive a short, concrete plan (max 6 bullet points) for implementing this in a small static web app.`,
              undefined,
              ctl.signal,
            ).catch(() => undefined);
            context =
              [context && `Screenshot brief:\n${context}`, planText].filter(Boolean).join("\n\n") ||
              undefined;
          }
        }
      }

      push({ role: "ai", text: `Writing it with ${model}…` });
      const opts: { context?: string; system?: string; signal?: AbortSignal } = {
        system: b.systemPrompt,
        signal: ctl.signal,
      };
      if (context) opts.context = context;
      const edit = await generateEdit(ollama, model, text, workspace.get().files, opts);
      apply(edit.files, edit.message);
      setBusy(false);
    } catch (e) {
      if (ctl.signal.aborted) {
        push({ role: "sys", text: "Stopped. Nothing was changed." });
        setBusy(false);
        return;
      }
      ruleEngine(
        text,
        `The AI engine didn't answer (${e instanceof Error ? e.message : "error"}), so I used the offline rule engine.`,
      );
    } finally {
      if (abortRef.current === ctl) abortRef.current = null;
    }
  };

  // Requests handed over from Create ("make a landing page…") start here automatically.
  const runRef = useRef(run);
  runRef.current = run;
  useEffect(() => {
    const first = buildHandoff.take();
    if (first) void runRef.current(first);
    return buildHandoff.onSend(() => {
      const p = buildHandoff.take();
      if (p) void runRef.current(p);
    });
  }, []);

  const fresh = msgs.length <= 1 && !busy;
  const pickable = m.live.filter((t) => !overLimit(t) && !VISION_RE.test(t) && !/embed/i.test(t));

  return (
    <div className="og-glass flex h-full min-h-0 flex-col">
      <style>{CHAT_CSS}</style>

      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="relative shrink-0">
            <span
              className="og-gradient absolute -inset-[2px] rounded-full opacity-80 blur-[1px]"
              aria-hidden
            />
            <img
              src="/og-bot-logo.png"
              alt=""
              className="relative h-9 w-9 rounded-full border border-background bg-background object-cover"
            />
            <span
              className={cn(
                "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background",
                busy
                  ? "animate-pulse bg-warning"
                  : activeTag && m.live.length
                    ? "bg-success"
                    : "bg-muted-foreground",
              )}
              aria-hidden
            />
          </span>
          <div className="min-w-0 leading-tight">
            <div className="flex items-center gap-1.5">
              <span className="font-brand text-sm font-semibold tracking-wide text-foreground">
                OG BOT
              </span>
              <span className="og-eyebrow !text-[9px] !tracking-[0.2em] text-primary">builder</span>
            </div>
            {newProject === null ? (
              <select
                aria-label="Project"
                value={ws.project}
                onChange={(e) =>
                  e.target.value === "__new" ? setNewProject("") : workspace.open(e.target.value)
                }
                className="-ml-1 max-w-[12rem] truncate rounded bg-transparent px-1 text-[11px] text-muted-foreground hover:text-foreground"
              >
                {workspace.projectNames().map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
                <option value="__new">+ New project…</option>
              </select>
            ) : (
              <form
                className="flex items-center gap-1"
                onSubmit={(e) => {
                  e.preventDefault();
                  const n = newProject.trim().replace(/[^\w.-]/g, "-");
                  if (n) workspace.create(n);
                  setNewProject(null);
                }}
              >
                <input
                  autoFocus
                  aria-label="New project name"
                  value={newProject}
                  onChange={(e) => setNewProject(e.target.value)}
                  placeholder="project-name"
                  className="w-28 rounded border border-border bg-background px-1.5 py-0.5 text-[11px]"
                />
                <button type="submit" aria-label="Create project" className="text-primary">
                  <Plus className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  aria-label="Cancel"
                  onClick={() => setNewProject(null)}
                  className="text-muted-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </form>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <label
            className="og-hairline flex items-center gap-1.5 rounded-full bg-background/40 px-2.5 py-1 font-mono text-[10px] text-muted-foreground"
            title="Model OG BOT writes with (14B max)"
          >
            <Cpu className="h-3 w-3 text-primary" />
            {pickable.length ? (
              <select
                aria-label="Model"
                value={activeTag ?? ""}
                onChange={(e) => models.setActive(e.target.value)}
                className="max-w-[9rem] truncate bg-transparent"
              >
                {!pickable.includes(activeTag ?? "") && activeTag && (
                  <option value={activeTag}>{activeTag}</option>
                )}
                {pickable.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            ) : (
              <span>{m.live.length ? activeTag : "offline"}</span>
            )}
          </label>
          {!fresh && (
            <button
              onClick={() => setMsgs(CHAT_GREETING)}
              title="New chat (the project keeps its files)"
              aria-label="New chat"
              className="rounded-full p-1.5 text-muted-foreground transition hover:bg-accent hover:text-foreground"
            >
              <Plus className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
        {fresh ? (
          <div className="og-fade mx-auto flex max-w-md flex-col items-center pt-4 text-center">
            <div className="relative mb-4">
              <span
                className="og-gradient absolute inset-0 rounded-full opacity-40 blur-2xl"
                aria-hidden
              />
              <img
                src="/og-bot-logo.png"
                alt=""
                className="relative h-16 w-16 rounded-full border border-border object-cover"
              />
            </div>
            <p className="og-eyebrow mb-1">OFFLINE FORGE · {ws.project}</p>
            <h2 className="font-brand text-xl font-semibold text-foreground">
              What shall we build?
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Describe it in your own words, or attach a screenshot of a look you like. Every change
              can be viewed and undone.
            </p>
            <div className="mt-5 grid w-full grid-cols-2 gap-2 text-left">
              {SUGGESTIONS.slice(0, 6).map(([label, ask]) => (
                <button
                  key={label}
                  onClick={() => void run(ask)}
                  className="og-hairline group flex flex-col items-start gap-1 rounded-xl bg-card/50 px-3 py-2.5 text-left text-xs text-foreground/90 transition hover:bg-primary/10"
                >
                  <Sparkles className="h-3.5 w-3.5 text-primary transition group-hover:scale-110" />
                  {label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-4">
            {msgs.map((msg, i) =>
              msg.role === "sys" ? (
                <div key={i} className="og-fade flex items-center gap-3 px-2">
                  <span className="h-px flex-1 bg-gradient-to-r from-transparent to-border" />
                  <span className="max-w-[80%] text-center text-[11px] text-muted-foreground">
                    {msg.text}
                  </span>
                  <span className="h-px flex-1 bg-gradient-to-l from-transparent to-border" />
                </div>
              ) : msg.role === "you" ? (
                <div key={i} className="og-fade flex justify-end">
                  <div className="og-gradient max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm px-4 py-2.5 text-sm text-primary-foreground shadow-lg shadow-primary/20">
                    {msg.text}
                  </div>
                </div>
              ) : (
                <div
                  key={i}
                  className={cn(
                    "og-fade flex items-start gap-2.5",
                    msgs[i - 1]?.role === "ai" && "-mt-2.5",
                  )}
                >
                  {msgs[i - 1]?.role === "ai" ? (
                    <span className="w-7 shrink-0" aria-hidden />
                  ) : (
                    <img
                      src="/og-bot-logo.png"
                      alt=""
                      className="mt-0.5 h-7 w-7 shrink-0 rounded-full border border-border object-cover"
                    />
                  )}
                  <div className="min-w-0 max-w-[88%]">
                    {msgs[i - 1]?.role !== "ai" && (
                      <div className="og-eyebrow mb-1 !text-[9px]">OG BOT</div>
                    )}
                    <div className="og-hairline rounded-2xl rounded-tl-sm bg-card/70 px-4 py-2.5 text-sm leading-relaxed text-foreground">
                      <Md text={msg.text} />
                      {(msg.edit || msg.editTrimmed) && (
                        <EditCard msg={msg} onUndo={() => undo(i)} />
                      )}
                    </div>
                  </div>
                </div>
              ),
            )}
            {busy && (
              <div className="og-fade flex items-start gap-2.5">
                <img
                  src="/og-bot-logo.png"
                  alt=""
                  className="mt-0.5 h-7 w-7 shrink-0 rounded-full border border-border object-cover"
                />
                <div className="og-hairline rounded-2xl rounded-tl-sm bg-card/70 px-4 py-3">
                  <span className="og-typing">
                    <i />
                    <i />
                    <i />
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
        <div ref={end} />
      </div>

      {/* Composer */}
      <div className="px-3 pb-3 pt-1">
        {!fresh && (
          <div className="og-scroll-x mb-2 flex gap-1.5 overflow-x-auto pb-1">
            {SUGGESTIONS.map(([label, ask]) => (
              <button
                key={label}
                onClick={() => void run(ask)}
                disabled={busy}
                className="shrink-0 rounded-full border border-border/70 bg-background/40 px-3 py-1 text-[11px] text-muted-foreground transition hover:border-primary hover:text-foreground disabled:opacity-40"
              >
                {label}
              </button>
            ))}
          </div>
        )}
        <div
          className="og-hairline rounded-2xl bg-background/60 p-2 shadow-2xl shadow-black/40 transition focus-within:shadow-primary/20"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            pickImage(e.dataTransfer.files[0]);
          }}
        >
          {image && (
            <div className="mb-2 flex items-center gap-2 px-1">
              <img
                src={image.url}
                alt="Attached screenshot"
                className="h-10 w-16 rounded border border-border object-cover"
              />
              <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
                {image.name}
              </span>
              <button
                aria-label="Remove screenshot"
                onClick={() => setImage(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              aria-label="Attach a screenshot"
              title="Attach a screenshot (make it look like this)"
              className="mb-1 shrink-0 rounded-lg p-2 text-muted-foreground transition hover:bg-accent hover:text-foreground"
            >
              <ImagePlus className="h-4 w-4" />
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => pickImage(e.target.files?.[0])}
            />
            <textarea
              rows={2}
              aria-label="Message OG BOT"
              className={cn(
                inputCls,
                "max-h-40 min-h-[44px] resize-none border-0 bg-transparent px-1 font-sans text-sm focus:border-0 focus:ring-0",
              )}
              placeholder={`Describe a change to ${ws.project}…`}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onPaste={(e) => {
                const f = [...e.clipboardData.files].find((x) => x.type.startsWith("image/"));
                if (f) {
                  e.preventDefault();
                  pickImage(f);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void run();
                }
              }}
            />
            {busy ? (
              <button
                onClick={stop}
                className="shrink-0 rounded-xl border border-destructive/60 p-3 text-destructive transition hover:bg-destructive/10"
                aria-label="Stop"
              >
                <Square className="h-4 w-4" />
              </button>
            ) : (
              <button
                onClick={() => void run()}
                disabled={!q.trim()}
                className="og-gradient shrink-0 rounded-xl p-3 text-primary-foreground shadow-lg shadow-primary/30 transition hover:brightness-110 disabled:opacity-40 disabled:shadow-none"
                aria-label="Send"
              >
                <Send className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="flex items-center justify-between px-2 pt-1 text-[10px] text-muted-foreground/80">
            <span>Enter to send · Shift + Enter for a new line · paste or drop a screenshot</span>
            <span className="hidden sm:inline">Each edit has View changes and Undo</span>
          </div>
        </div>
      </div>
    </div>
  );
}

const CHAT_CSS = `
.og-scroll-x{scrollbar-width:none}.og-scroll-x::-webkit-scrollbar{display:none}
.og-fade{animation:ogFade .25s ease-out}
@keyframes ogFade{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
.og-typing{display:inline-flex;gap:4px;align-items:center}
.og-typing i{width:6px;height:6px;border-radius:50%;background:var(--og-primary,#3d5afe);display:inline-block;animation:ogBounce 1.2s infinite ease-in-out}
.og-typing i:nth-child(2){animation-delay:.15s}
.og-typing i:nth-child(3){animation-delay:.3s}
@keyframes ogBounce{0%,60%,100%{transform:translateY(0);opacity:.5}30%{transform:translateY(-5px);opacity:1}}
`;
