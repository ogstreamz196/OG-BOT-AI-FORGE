import { useEffect, useRef, useState } from "react";
import { Send, Sparkles, Cpu } from "lucide-react";
import { inputCls } from "./ui";
import { cn } from "@/lib/utils";
import { slashReply } from "./Agent";
import { planEdit } from "@/lib/agent-edits";
import { workspace, useWorkspace } from "@/lib/workspace";
import { usage } from "@/lib/usage";
import { useModels } from "@/lib/models";

type Msg = { role: "you" | "ai" | "sys"; text: string };

const SUGGESTIONS = [
  "Add a dark mode toggle",
  "Set the title to OG BOT",
  "Change the background to #0a0e17",
  "/scaffold my-app",
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

  const run = (raw?: string) => {
    const text = (raw ?? q).trim();
    if (!text || busy) return;
    push({ role: "you", text });
    setQ("");
    setBusy(true);
    usage.record("prompts");

    const reply: string[] = [];
    if (text.startsWith("/")) {
      const lines = slashReply(text);
      reply.push(
        ...(lines ?? [
          `Unknown command "${text.split(" ")[0]}". Try /scaffold or just describe a change.`,
        ]),
      );
    } else {
      const { patch, log } = planEdit(workspace.get().files, text);
      if (Object.keys(patch).length) {
        workspace.writeFiles(patch);
        usage.record("edits");
      }
      reply.push(...log);
    }

    // Stream the reply lines for a live feel.
    reply.forEach((line, i) => {
      setTimeout(
        () => {
          push({ role: "ai", text: line });
          if (i === reply.length - 1) setBusy(false);
        },
        250 * (i + 1),
      );
    });
    if (reply.length === 0) setBusy(false);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <div className="flex items-center gap-2 font-display text-sm uppercase text-foreground">
          <Sparkles className="h-4 w-4 text-primary" /> AI Builder
        </div>
        <span className="flex items-center gap-1 rounded border border-border px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
          <Cpu className="h-3 w-3" />
          {activeId ? activeId : "no model · offline"}
        </span>
      </div>

      <div className="flex-1 min-h-0 space-y-3 overflow-y-auto p-4">
        {msgs.map((msg, i) => (
          <div key={i} className={cn("flex", msg.role === "you" ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-[85%] rounded-2xl px-3 py-2 text-sm",
                msg.role === "you" && "bg-primary text-primary-foreground",
                msg.role === "ai" && "border border-border bg-card text-foreground",
                msg.role === "sys" && "bg-muted/60 text-xs text-muted-foreground",
              )}
            >
              {msg.text}
            </div>
          </div>
        ))}
        {busy && <div className="animate-pulse font-mono text-xs text-primary">AI is working…</div>}
        <div ref={end} />
      </div>

      <div className="border-t border-border p-3">
        <div className="mb-2 flex flex-wrap gap-1">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => run(s)}
              className="rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground transition hover:border-primary hover:text-primary"
            >
              {s}
            </button>
          ))}
        </div>
        <div className="flex items-end gap-2">
          <textarea
            rows={1}
            className={cn(inputCls, "max-h-32 resize-none")}
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
            className="shrink-0 rounded-lg bg-primary p-2.5 text-primary-foreground transition hover:opacity-90 disabled:opacity-40"
            aria-label="Send"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
