import { useEffect, useRef, useState } from "react";
import { usePersistentState } from "@/hooks/use-persistent-state";
import { Send, Sparkles, Cpu } from "lucide-react";
import { inputCls } from "./ui";
import { cn } from "@/lib/utils";
import { slashReply } from "./Agent";
import { planEdit } from "@/lib/agent-edits";
import { workspace, useWorkspace } from "@/lib/workspace";
import { usage } from "@/lib/usage";
import { models, useModels } from "@/lib/models";
import { connectors } from "@/lib/connectors";
import { buildHandoff } from "@/lib/build-handoff";
import { generateEdit, pingOllama, quickChat } from "@/lib/local-ai";
import { permissions } from "@/lib/permissions";
import { brain } from "@/lib/brain";
import { dispatch } from "@/lib/orchestrator";

type Msg = { role: "you" | "ai" | "sys"; text: string };

const SUGGESTIONS = [
  "/scaffold mysite landing",
  "Add a hero",
  "Add a features grid",
  "Add a pricing table",
  "Add a contact form",
  "Add a footer",
  "Add a dark mode toggle",
  "Set the title to OG BOT",
];

const CHAT_GREETING: Msg[] = [
  {
    role: "sys",
    text: "OG BOT here, powering your OFFLINE FORGE · 100% offline. Describe a change and I'll edit your app; the preview updates live.",
  },
];

export function Chat() {
  const ws = useWorkspace();
  useModels(); // re-render when the live model list / active model changes
  const activeTag = models.activeTag();
  const liveCount = models.liveCount();
  // Saved in this browser so the conversation survives reloads.
  const [msgs, setMsgs] = usePersistentState<Msg[]>("og-chat-v1", CHAT_GREETING);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
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

  const push = (msg: Msg) => setMsgs((l) => [...l, msg].slice(-300));

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

  const ruleEngine = (text: string): string[] => {
    const { patch, log } = planEdit(workspace.get().files, text);
    if (Object.keys(patch).length) {
      workspace.writeFiles(patch);
      usage.record("edits");
    }
    return log;
  };

  const run = async (raw?: string) => {
    const text = (raw ?? q).trim();
    if (!text || busy) return;
    push({ role: "you", text });
    setQ("");
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
      stream(ruleEngine(text));
      return;
    }

    try {
      const b = brain.get();
      let model = models.activeTag() ?? "llama3.2:1b";
      let context: string | undefined;

      if (b.smartRoute) {
        // Smart routing (opt-in): a live dispatcher picks a specialist model and
        // may chain reason→build. Slower (extra model calls), higher quality.
        const orchestrate = await permissions.request("orchestrate");
        if (orchestrate) {
          const health = await pingOllama(ollama);
          if (health.ok) models.syncLive(health.models);
          const installed = health.models.length ? health.models : model ? [model] : [];
          const plan = await dispatch(text, installed, (m, p) => quickChat(ollama, m, p), {
            allowChain: b.chain,
            routerModel: b.routerModel || null,
            byName: b.routeByName,
          });
          const { kind, steps } = plan;
          const build = steps.find((s) => s.role === "build");
          const reason = steps.find((s) => s.role === "reason");
          if (build) model = build.model;
          if (plan.routed && plan.router) {
            const how = plan.byName ? "named" : kind;
            push({ role: "ai", text: `Router (${plan.router}) → ${how} · ${model}` });
          }
          if (reason) {
            push({ role: "ai", text: `Reasoning with ${reason.model}…` });
            context = await quickChat(
              ollama,
              reason.model,
              `Task: ${text}\nGive a short, concrete plan (max 6 bullet points) for implementing this in a small static web app.`,
            ).catch(() => undefined);
          }
          push({
            role: "ai",
            text: `Building with ${model} · ${kind}${reason ? " (chained)" : ""}…`,
          });
        } else {
          push({ role: "ai", text: `Generating with ${model}…` });
        }
      } else {
        // Fast path (default): one warm model, no router round-trips, no reload.
        push({ role: "ai", text: `Generating with ${model}…` });
      }

      const opts: { context?: string; system?: string } = { system: b.systemPrompt };
      if (context) opts.context = context;
      const edit = await generateEdit(ollama, model, text, workspace.get().files, opts);
      workspace.writeFiles(edit.files);
      usage.record("edits");
      stream([edit.message, `Updated ${Object.keys(edit.files).join(", ")}.`]);
    } catch (e) {
      stream([
        `Local model unavailable (${e instanceof Error ? e.message : "error"}) — used the offline rule engine instead.`,
        ...ruleEngine(text),
      ]);
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

  return (
    <div className="og-glass flex h-full min-h-0 flex-col">
      <style>{CHAT_CSS}</style>

      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
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
                  : activeTag
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
            <div className="truncate text-[11px] text-muted-foreground">
              {busy ? (
                "Crafting your change…"
              ) : (
                <>
                  Editing <span className="text-foreground/80">{ws.project}</span>
                </>
              )}
            </div>
          </div>
        </div>
        <span
          className="og-hairline flex shrink-0 items-center gap-1.5 rounded-full bg-background/40 px-3 py-1 font-mono text-[10px] text-muted-foreground"
          title={activeTag ? "Local model in use" : "No local model connected"}
        >
          <Cpu className="h-3 w-3 text-primary" />
          {activeTag ? `${activeTag}${liveCount > 1 ? ` · ${liveCount}` : ""}` : "offline"}
        </span>
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
            <p className="og-eyebrow mb-1">OFFLINE FORGE</p>
            <h2 className="font-brand text-xl font-semibold text-foreground">
              What shall we build?
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Describe it in your own words. I'll write it, and the preview updates as I go. Every
              change can be undone.
            </p>
            <div className="mt-5 grid w-full grid-cols-2 gap-2 text-left">
              {SUGGESTIONS.slice(0, 6).map((s) => (
                <button
                  key={s}
                  onClick={() => run(s)}
                  className="og-hairline group flex flex-col items-start gap-1 rounded-xl bg-card/50 px-3 py-2.5 text-left text-xs text-foreground/90 transition hover:bg-primary/10"
                >
                  <Sparkles className="h-3.5 w-3.5 text-primary transition group-hover:scale-110" />
                  {s.startsWith("/") ? "Start a landing page" : s}
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
                    <div className="og-hairline whitespace-pre-wrap rounded-2xl rounded-tl-sm bg-card/70 px-4 py-2.5 text-sm leading-relaxed text-foreground">
                      {msg.text}
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
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => run(s)}
                disabled={busy}
                className="shrink-0 rounded-full border border-border/70 bg-background/40 px-3 py-1 text-[11px] text-muted-foreground transition hover:border-primary hover:text-foreground disabled:opacity-40"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        <div className="og-hairline rounded-2xl bg-background/60 p-2 shadow-2xl shadow-black/40 transition focus-within:shadow-primary/20">
          <div className="flex items-end gap-2">
            <textarea
              rows={2}
              aria-label="Message OG BOT"
              className={cn(
                inputCls,
                "max-h-40 min-h-[44px] resize-none border-0 bg-transparent px-2 font-sans text-sm focus:border-0 focus:ring-0",
              )}
              placeholder={`Describe a change to ${ws.project}…`}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  run();
                }
              }}
            />
            <button
              onClick={() => run()}
              disabled={busy || !q.trim()}
              className="og-gradient shrink-0 rounded-xl p-3 text-primary-foreground shadow-lg shadow-primary/30 transition hover:brightness-110 disabled:opacity-40 disabled:shadow-none"
              aria-label="Send"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
          <div className="flex items-center justify-between px-2 pt-1 text-[10px] text-muted-foreground/80">
            <span>Enter to send · Shift + Enter for a new line</span>
            <span className="hidden sm:inline">Undo any change in the preview toolbar</span>
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
