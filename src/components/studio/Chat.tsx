import { useEffect, useRef, useState } from "react";
import { Send, Sparkles, Cpu, Bot, User } from "lucide-react";
import { inputCls } from "./ui";
import { cn } from "@/lib/utils";
import { slashReply } from "./Agent";
import { planEdit } from "@/lib/agent-edits";
import { workspace, useWorkspace } from "@/lib/workspace";
import { usage } from "@/lib/usage";
import { models, useModels } from "@/lib/models";
import { connectors } from "@/lib/connectors";
import { generateEdit, pingOllama, quickChat } from "@/lib/local-ai";
import { permissions } from "@/lib/permissions";
import { brain } from "@/lib/brain";
import { planChain } from "@/lib/orchestrator";

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

export function Chat() {
  const ws = useWorkspace();
  const m = useModels();
  const activeId = m.active;
  const [msgs, setMsgs] = useState<Msg[]>([
    {
      role: "sys",
      text: "OG-BOT AI builder · 100% offline. Describe a change and I'll edit your app; the preview updates live.",
    },
  ]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [msgs]);

  const push = (msg: Msg) => setMsgs((l) => [...l, msg]);

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
      // Ask once to let the AI route across all your models (and chain them).
      const orchestrate = await permissions.request("orchestrate");
      const b = brain.get();
      let model = models.activeDef()?.pull ?? "llama3.2:1b";
      let context: string | undefined;

      if (orchestrate) {
        const health = await pingOllama(ollama);
        const installed = health.models.length ? health.models : model ? [model] : [];
        const { kind, steps } = planChain(text, installed, { allowChain: b.chain });
        const build = steps.find((s) => s.role === "build");
        const reason = steps.find((s) => s.role === "reason");
        if (build) model = build.model;
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

  return (
    <div className="flex h-full min-h-0 flex-col">
      <style>{CHAT_CSS}</style>

      {/* Header */}
      <div className="flex items-center justify-between border-b border-border bg-gradient-to-r from-primary/10 to-transparent px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="relative flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-primary">
            <Sparkles className="h-4 w-4" />
            <span
              className={cn(
                "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-background",
                busy ? "bg-warning" : activeId ? "bg-primary" : "bg-secondary",
              )}
            />
          </span>
          <div className="leading-tight">
            <div className="font-display text-sm uppercase text-foreground">AI Builder</div>
            <div className="font-mono text-[10px] text-muted-foreground">
              {busy ? "working…" : "ready"}
            </div>
          </div>
        </div>
        <span className="flex items-center gap-1 rounded-full border border-border bg-card/60 px-2.5 py-1 font-mono text-[10px] text-muted-foreground">
          <Cpu className="h-3 w-3" />
          {activeId ? activeId : "no model · offline"}
        </span>
      </div>

      {/* Messages */}
      <div className="flex-1 min-h-0 space-y-3 overflow-y-auto px-3 py-4">
        {msgs.map((msg, i) =>
          msg.role === "sys" ? (
            <div key={i} className="og-fade flex justify-center">
              <div className="rounded-full bg-muted/50 px-3 py-1 text-center text-[11px] text-muted-foreground">
                {msg.text}
              </div>
            </div>
          ) : (
            <div
              key={i}
              className={cn(
                "og-fade flex items-end gap-2",
                msg.role === "you" ? "flex-row-reverse" : "flex-row",
              )}
            >
              <span
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                  msg.role === "you"
                    ? "bg-primary/20 text-primary"
                    : "bg-secondary/20 text-secondary",
                )}
              >
                {msg.role === "you" ? (
                  <User className="h-3.5 w-3.5" />
                ) : (
                  <Bot className="h-3.5 w-3.5" />
                )}
              </span>
              <div
                className={cn(
                  "max-w-[80%] rounded-2xl px-3.5 py-2 text-sm shadow-sm",
                  msg.role === "you"
                    ? "rounded-br-md bg-primary text-primary-foreground"
                    : "rounded-bl-md border border-border bg-card text-foreground",
                )}
              >
                {msg.text}
              </div>
            </div>
          ),
        )}
        {busy && (
          <div className="og-fade flex items-end gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary/20 text-secondary">
              <Bot className="h-3.5 w-3.5" />
            </span>
            <div className="rounded-2xl rounded-bl-md border border-border bg-card px-3.5 py-3">
              <span className="og-typing">
                <i />
                <i />
                <i />
              </span>
            </div>
          </div>
        )}
        <div ref={end} />
      </div>

      {/* Composer */}
      <div className="border-t border-border p-3">
        <div className="mb-2 flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => run(s)}
              className="rounded-full border border-border bg-card/40 px-2.5 py-1 text-[11px] text-muted-foreground transition hover:border-primary hover:bg-primary/10 hover:text-primary"
            >
              {s}
            </button>
          ))}
        </div>
        <div className="flex items-end gap-2 rounded-2xl border border-border bg-card/60 p-1.5 transition focus-within:border-primary">
          <textarea
            rows={1}
            className={cn(
              inputCls,
              "max-h-32 resize-none border-0 bg-transparent focus:border-0 focus:ring-0",
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
            className="shrink-0 rounded-xl bg-primary p-2.5 text-primary-foreground transition hover:opacity-90 disabled:opacity-40"
            aria-label="Send"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

const CHAT_CSS = `
.og-fade{animation:ogFade .25s ease-out}
@keyframes ogFade{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
.og-typing{display:inline-flex;gap:4px;align-items:center}
.og-typing i{width:6px;height:6px;border-radius:50%;background:var(--og-primary,#3d5afe);display:inline-block;animation:ogBounce 1.2s infinite ease-in-out}
.og-typing i:nth-child(2){animation-delay:.15s}
.og-typing i:nth-child(3){animation-delay:.3s}
@keyframes ogBounce{0%,60%,100%{transform:translateY(0);opacity:.5}30%{transform:translateY(-5px);opacity:1}}
`;
