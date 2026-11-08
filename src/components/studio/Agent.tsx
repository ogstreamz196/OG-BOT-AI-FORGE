import { useCallback, useEffect, useRef, useState } from "react";
import { Panel, Btn, inputCls } from "./ui";
import { usePersistentState } from "@/hooks/use-persistent-state";
import { cn } from "@/lib/utils";
import {
  CHAT_MODELS,
  DEFAULT_MODEL,
  DEFAULT_OLLAMA_URL,
  OLLAMA_MODELS,
  listInstalled,
  sameModel,
  streamChat,
  type ChatMessage,
} from "@/lib/ollama";

// ai: true marks real model replies (sent back as conversation context).
type Line = { t: "user" | "agent" | "sys" | "ok" | "err"; s: string; ai?: boolean; model?: string };

// Delay between lines of the demo slash-command output (ms).
const STEP_MS = 150;
const GREETING: Line[] = [{ t: "sys", s: "OG-BOT agent online · runs on your local Ollama models" }];
const SYSTEM_PROMPT =
  "You are OG-BOT, an expert coding assistant running fully offline on the user's own computer. " +
  "Give direct, working answers. Use fenced code blocks for code. Keep explanations short.";
// How many earlier messages to send with each question (more = slower).
const CONTEXT_LINES = 12;

const COMMANDS = ["/scaffold my-app", "/edit add dark mode toggle", "/export-apk", "/git-commit Updates", "/git-push"];

/** Demo output for slash commands (these don't call the model yet). */
export function slashReply(cmd: string): string[] | null {
  const arg = (c: string) => cmd.slice(c.length).trim();
  if (cmd.startsWith("/scaffold")) { const n = arg("/scaffold") || "og-bot-gen-app"; return [`Creating projects/${n}/`, "Writing index.html, styles.css, app.js", `Project ${n} ready.`]; }
  if (cmd.startsWith("/edit")) return [`Planning edit: ${arg("/edit") || "(no instruction)"}`, "Patching index.html (+12 −2)", "Edit applied."];
  if (cmd.startsWith("/export-apk")) return ["Syncing web assets to Capacitor", "Running Gradle assembleDebug", "APK written to mobile-sdk/output/app-debug.apk"];
  if (cmd.startsWith("/git-commit")) return ["Staging all changes", `Committed: "${arg("/git-commit") || "Update"}" (queued for push)`];
  if (cmd.startsWith("/git-push")) return ["Pushing to origin/main", "Push complete."];
  return null;
}

/** Earlier chat turns to send as context. Strips DeepSeek R1's <think> blocks. */
export function buildContext(lines: Line[]): ChatMessage[] {
  return lines
    .filter((l) => l.t === "user" ? !l.s.startsWith("/") : l.ai)
    .slice(-CONTEXT_LINES)
    .map((l) => ({
      role: l.t === "user" ? "user" : "assistant",
      content: l.t === "user" ? l.s : l.s.replace(/<think>[\s\S]*?<\/think>/g, "").trim(),
    }));
}

type Conn = { state: "checking" | "online" | "offline"; installed: string[]; error?: string };

export function Agent() {
  const [lines, setLines] = usePersistentState<Line[]>("ogbot.agent.history", GREETING);
  const [model, setModel] = usePersistentState("ogbot.agent.model", DEFAULT_MODEL);
  const [url, setUrl] = usePersistentState("ogbot.agent.ollamaUrl", DEFAULT_OLLAMA_URL);
  const [conn, setConn] = useState<Conn>({ state: "checking", installed: [] });
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => end.current?.scrollIntoView({ block: "nearest" }), [lines]);

  const check = useCallback(async () => {
    setConn((c) => ({ ...c, state: "checking" }));
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 4000);
    try {
      const installed = await listInstalled(url, ctl.signal);
      setConn({ state: "online", installed });
    } catch (e) {
      setConn({ state: "offline", installed: [], error: e instanceof Error ? e.message : String(e) });
    } finally {
      clearTimeout(timer);
    }
  }, [url]);

  useEffect(() => {
    const t = setTimeout(check, 400);
    return () => clearTimeout(t);
  }, [check]);

  const isInstalled = (tag: string) => conn.installed.some((i) => sameModel(i, tag));
  const add = (line: Line) => setLines((l) => [...l, line]);

  const runSlash = (slash: string[]) => {
    slash.forEach((s, i) => setTimeout(() => {
      add({ t: i === slash.length - 1 ? "ok" : "agent", s });
      if (i === slash.length - 1) setBusy(false);
    }, STEP_MS * (i + 1)));
  };

  const ask = async (prompt: string, history: Line[]) => {
    const ctl = new AbortController();
    abort.current = ctl;
    const messages: ChatMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
      ...buildContext(history),
      { role: "user", content: prompt },
    ];
    // Add an empty reply line, then grow it as text streams in.
    setLines((l) => [...l, { t: "agent", s: "", ai: true, model }]);
    const append = (text: string) =>
      setLines((l) => {
        const last = l[l.length - 1]!;
        return [...l.slice(0, -1), { ...last, s: last.s + text }];
      });
    try {
      await streamChat({ baseUrl: url, model, messages, onToken: append, signal: ctl.signal });
    } catch (e) {
      if (ctl.signal.aborted) add({ t: "sys", s: "Stopped." });
      else {
        const msg = e instanceof Error ? e.message : String(e);
        const notPulled = /not found/i.test(msg);
        add({
          t: "err",
          s: notPulled
            ? `${model} isn't installed. On your laptop run:  ollama pull ${model}`
            : msg.includes("403")
              ? msg
              : `Couldn't reach Ollama at ${url} (${msg}). Click "Setup" for help.`,
        });
        if (!notPulled) setConn({ state: "offline", installed: [], error: msg });
      }
    } finally {
      abort.current = null;
      setBusy(false);
    }
  };

  const run = () => {
    const cmd = q.trim();
    if (!cmd || busy) return;
    const history = lines;
    add({ t: "user", s: cmd });
    setQ("");
    setBusy(true);
    const slash = slashReply(cmd);
    if (slash) return runSlash(slash);
    void ask(cmd, history);
  };

  const color = { user: "text-secondary", agent: "text-foreground", sys: "text-muted-foreground", ok: "text-primary text-glow", err: "text-destructive" };
  const prefix = { user: "you ❯", agent: "bot ›", sys: "sys ·", ok: "bot ✓", err: "err !" };
  const dot = { checking: "bg-warning animate-pulse", online: "bg-primary", offline: "bg-destructive" }[conn.state];
  const status = {
    checking: "Connecting…",
    online: `Ollama connected · ${conn.installed.length} model${conn.installed.length === 1 ? "" : "s"} installed`,
    offline: conn.error?.includes("403") ? "Ollama is blocking this site · see Setup" : "Ollama not reachable",
  }[conn.state];
  const missing = OLLAMA_MODELS.filter((m) => conn.state === "online" && !isInstalled(m.tag));

  return (
    <Panel
      title="Autonomous Agent Console"
      className="h-full min-h-[560px]"
      right={
        <div className="flex items-center gap-2">
          <Btn variant="ghost" onClick={() => setLines(GREETING)} disabled={busy}>Clear</Btn>
          <span className="font-mono text-xs text-primary">{busy ? "● WORKING" : "○ IDLE"}</span>
        </div>
      }
    >
      <div className="flex h-full flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2 rounded border border-border bg-card px-2 py-1.5 font-mono text-[11px]">
          <span className={cn("h-2 w-2 rounded-full", dot)} />
          <span className="text-muted-foreground">{status}</span>
          <select
            aria-label="Model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            disabled={busy}
            className="ml-auto rounded border border-border bg-background px-2 py-1 text-foreground"
          >
            {CHAT_MODELS.map((m) => (
              <option key={m.tag} value={m.tag}>
                {m.label} ({m.tag}){conn.state === "online" && !isInstalled(m.tag) ? " · not installed" : ""}
              </option>
            ))}
          </select>
          <button onClick={() => void check()} className="rounded border border-border px-2 py-1 text-muted-foreground hover:border-primary hover:text-primary">Retry</button>
          <button onClick={() => setShowSetup((s) => !s)} className="rounded border border-border px-2 py-1 text-muted-foreground hover:border-primary hover:text-primary">Setup</button>
        </div>

        {showSetup && (
          <div className="space-y-2 rounded border border-border bg-card p-3 text-xs">
            <label className="block font-mono text-[11px] text-muted-foreground">
              Ollama address
              <input aria-label="Ollama address" className={cn(inputCls, "mt-1")} value={url} onChange={(e) => setUrl(e.target.value)} />
            </label>
            <p className="text-muted-foreground">
              1. Install Ollama from ollama.com on the computer with your GPU. 2. Let this site talk to it: quit Ollama, set the environment variable{" "}
              <code className="text-foreground">OLLAMA_ORIGINS=https://*.lovable.app</code>, then start Ollama again. 3. Pull the models you want.
              4. Use Chrome or Edge, and click Allow if the browser asks to access devices on your network.
            </p>
            {missing.length > 0 && (
              <div>
                <div className="mb-1 font-mono text-[11px] text-muted-foreground">Not installed yet. Run on that computer:</div>
                <pre className="overflow-auto rounded bg-background p-2 font-mono text-[11px] text-foreground">{missing.map((m) => `ollama pull ${m.tag}`).join("\n")}</pre>
              </div>
            )}
            {conn.state === "offline" && conn.error && <p className="font-mono text-[11px] text-destructive">Last error: {conn.error}</p>}
          </div>
        )}

        <div className="flex-1 min-h-[400px] overflow-auto rounded border border-border bg-background p-3 font-mono text-xs">
          {lines.map((l, i) => (
            <div key={i} className={cn("whitespace-pre-wrap break-words", color[l.t])}>
              <span className="mr-2 opacity-60">{prefix[l.t]}</span>
              {l.s}
            </div>
          ))}
          {busy && <div className="animate-pulse text-primary">▌</div>}
          <div ref={end} />
        </div>
        <div className="flex flex-wrap gap-1">
          {COMMANDS.map((c) => (
            <button key={c} onClick={() => setQ(c)} className="rounded border border-border px-2 py-0.5 font-mono text-[11px] text-muted-foreground hover:border-primary hover:text-primary">{c.split(" ")[0]}</button>
          ))}
        </div>
        <div className="flex gap-2">
          <input className={inputCls} placeholder="Ask anything, e.g. 'write a login screen in React'" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && run()} />
          {busy && abort.current ? <Btn variant="danger" onClick={() => abort.current?.abort()}>Stop</Btn> : <Btn onClick={run} disabled={busy}>Run</Btn>}
        </div>
      </div>
    </Panel>
  );
}
