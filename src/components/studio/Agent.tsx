import { useEffect, useRef, useState } from "react";
import { Panel, Btn, inputCls } from "./ui";

type Line = { t: "user" | "agent" | "sys" | "ok"; s: string };
const STEPS = [
  "Loading local model og-coder-7b.gguf (Q4_K_M)…",
  "Indexing workspace: 3 files, 42 symbols",
  "Planning: breaking task into 4 sub-steps",
  "Editing src/App.tsx (+28 −4)",
  "Running local test suite… 12 passed",
  "Task complete. No network calls were made.",
];

const COMMANDS = ["/scaffold my-app", "/edit add dark mode toggle", "/export-apk", "/git-commit Updates", "/git-push"];

export function slashReply(cmd: string): string[] | null {
  const arg = (c: string) => cmd.slice(c.length).trim();
  if (cmd.startsWith("/scaffold")) { const n = arg("/scaffold") || "og-bot-gen-app"; return [`Creating projects/${n}/`, "Writing index.html, styles.css, app.js", `Project ${n} ready.`]; }
  if (cmd.startsWith("/edit")) return [`Planning edit: ${arg("/edit") || "(no instruction)"}`, "Patching index.html (+12 −2)", "Edit applied."];
  if (cmd.startsWith("/export-apk")) return ["Syncing web assets to Capacitor", "Running Gradle assembleDebug", "APK written to mobile-sdk/output/app-debug.apk"];
  if (cmd.startsWith("/git-commit")) return ["Staging all changes", `Committed: "${arg("/git-commit") || "Update"}" (queued for push)`];
  if (cmd.startsWith("/git-push")) return ["Pushing to origin/main", "Push complete."];
  return null;
}

export function Agent() {
  const [lines, setLines] = useState<Line[]>([{ t: "sys", s: "OG-BOT agent online · 100% offline · model: og-coder-7b" }]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => end.current?.scrollIntoView({ block: "nearest" }), [lines]);

  const run = () => {
    if (!q.trim() || busy) return;
    setLines((l) => [...l, { t: "user", s: q }]);
    const cmd = q.trim();
    setQ("");
    setBusy(true);
    const slash = slashReply(cmd);
    if (slash) {
      slash.forEach((s, i) => setTimeout(() => {
        setLines((l) => [...l, { t: i === slash.length - 1 ? "ok" : "agent", s }]);
        if (i === slash.length - 1) setBusy(false);
      }, 500 * (i + 1)));
      return;
    }
    STEPS.forEach((s, i) =>
      setTimeout(() => {
        setLines((l) => [...l, { t: i === STEPS.length - 1 ? "ok" : "agent", s }]);
        if (i === STEPS.length - 1) setBusy(false);
      }, 600 * (i + 1)),
    );
  };
  const color = { user: "text-secondary", agent: "text-foreground", sys: "text-muted-foreground", ok: "text-primary text-glow" };
  const prefix = { user: "you ❯", agent: "bot ›", sys: "sys ·", ok: "bot ✓" };

  return (
    <Panel title="Autonomous Agent Console" className="h-full min-h-[560px]" right={<span className="font-mono text-xs text-primary">{busy ? "● WORKING" : "○ IDLE"}</span>}>
      <div className="flex h-full flex-col gap-2">
        <div className="flex-1 min-h-[440px] overflow-auto rounded border border-border bg-background p-3 font-mono text-xs">
          {lines.map((l, i) => (
            <div key={i} className={color[l.t]}><span className="mr-2 opacity-60">{prefix[l.t]}</span>{l.s}</div>
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
          <input className={inputCls} placeholder="Describe a task, e.g. 'add a login screen'" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && run()} />
          <Btn onClick={run} disabled={busy}>Run</Btn>
        </div>
      </div>
    </Panel>
  );
}
