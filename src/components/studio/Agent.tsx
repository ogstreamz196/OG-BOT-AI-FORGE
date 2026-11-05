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

export function Agent() {
  const [lines, setLines] = useState<Line[]>([{ t: "sys", s: "OG-BOT agent online · 100% offline · model: og-coder-7b" }]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => end.current?.scrollIntoView({ block: "nearest" }), [lines]);

  const run = () => {
    if (!q.trim() || busy) return;
    setLines((l) => [...l, { t: "user", s: q }]);
    setQ("");
    setBusy(true);
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
        <div className="flex gap-2">
          <input className={inputCls} placeholder="Describe a task, e.g. 'add a login screen'" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && run()} />
          <Btn onClick={run} disabled={busy}>Run</Btn>
        </div>
      </div>
    </Panel>
  );
}
