import { useState } from "react";
import { GitBranch, GitCommit, ArrowDown, ArrowUp, RefreshCw } from "lucide-react";
import { Panel, Btn, inputCls } from "./ui";
import { cn } from "@/lib/utils";

type FileChange = { path: string; status: "M" | "A" | "D"; staged: boolean };
type Commit = { hash: string; msg: string; author: string; time: string; pushed: boolean };

const hash = () => Math.random().toString(16).slice(2, 9);

export function GitSync() {
  const [remote, setRemote] = useState("https://github.com/ogstreamz196/OG-BOT-OFFLINE-AI.git");
  const [connected, setConnected] = useState(true);
  const [branch, setBranch] = useState("main");
  const [branches, setBranches] = useState(["main", "dev", "feature/apk-forge"]);
  const [newBranch, setNewBranch] = useState("");
  const [behind, setBehind] = useState(2);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [log, setLog] = useState<string[]>(["Ready. Working offline — commits are queued locally."]);
  const [files, setFiles] = useState<FileChange[]>([
    { path: "src/App.tsx", status: "M", staged: false },
    { path: "src/screens/Player.tsx", status: "A", staged: false },
    { path: "assets/old-logo.png", status: "D", staged: false },
  ]);
  const [commits, setCommits] = useState<Commit[]>([
    { hash: "a91f3c2", msg: "Add audio studio waveform", author: "Faiyaz", time: "2h ago", pushed: true },
    { hash: "7be0d14", msg: "Initial OG-BOT studio", author: "Faiyaz", time: "1d ago", pushed: true },
  ]);

  const ahead = commits.filter((c) => !c.pushed).length;
  const say = (s: string) => setLog((l) => [`${new Date().toLocaleTimeString()}  ${s}`, ...l].slice(0, 30));
  const run = (name: string, fn: () => void) => {
    setBusy(name);
    setTimeout(() => { fn(); setBusy(null); }, 900);
  };

  const commit = () => {
    const staged = files.filter((f) => f.staged);
    if (!msg.trim() || !staged.length) return;
    setCommits((c) => [{ hash: hash(), msg: msg.trim(), author: "Faiyaz", time: "just now", pushed: false }, ...c]);
    setFiles((f) => f.filter((x) => !x.staged));
    say(`Committed ${staged.length} file(s) to ${branch} — queued for push`);
    setMsg("");
  };
  const pull = () => run("pull", () => { say(behind ? `Pulled ${behind} commit(s) from origin/${branch}` : "Already up to date"); setBehind(0); });
  const push = () => run("push", () => {
    if (!ahead) return say("Nothing to push");
    setCommits((c) => c.map((x) => ({ ...x, pushed: true })));
    say(`Pushed ${ahead} commit(s) to origin/${branch}`);
  });
  const fetchR = () => run("fetch", () => { const n = Math.floor(Math.random() * 3); setBehind((b) => b + n); say(`Fetched origin — ${n} new commit(s)`); });
  const syncAll = () => run("sync", () => {
    setBehind(0); setCommits((c) => c.map((x) => ({ ...x, pushed: true })));
    say(`Synced ${branch}: pulled & pushed ${ahead} commit(s)`);
  });

  const statusColor = { M: "text-warning", A: "text-primary", D: "text-destructive" };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Repository" right={<span className={cn("text-[10px] font-bold uppercase tracking-widest", connected ? "text-primary" : "text-muted-foreground")}>{connected ? "● Linked" : "○ Unlinked"}</span>}>
        <div className="space-y-3">
          <input className={inputCls} value={remote} onChange={(e) => setRemote(e.target.value)} placeholder="https://github.com/user/repo.git" />
          <div className="flex flex-wrap gap-2">
            <Btn variant={connected ? "ghost" : "primary"} onClick={() => { setConnected(!connected); say(connected ? "Remote unlinked" : `Linked ${remote}`); }}>{connected ? "Unlink" : "Link repo"}</Btn>
          </div>
          <div className="flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-secondary" />
            <select className={inputCls} value={branch} onChange={(e) => { setBranch(e.target.value); say(`Switched to ${e.target.value}`); }}>
              {branches.map((b) => <option key={b}>{b}</option>)}
            </select>
          </div>
          <div className="flex gap-2">
            <input className={inputCls} value={newBranch} onChange={(e) => setNewBranch(e.target.value)} placeholder="new-branch-name" />
            <Btn variant="ghost" onClick={() => { const n = newBranch.trim().replace(/\s+/g, "-"); if (!n || branches.includes(n)) return; setBranches([...branches, n]); setBranch(n); setNewBranch(""); say(`Created branch ${n}`); }}>Create</Btn>
          </div>
          <div className="flex gap-4 text-sm">
            <span className="flex items-center gap-1"><ArrowDown className="h-4 w-4 text-secondary" />{behind} behind</span>
            <span className="flex items-center gap-1"><ArrowUp className="h-4 w-4 text-primary" />{ahead} ahead</span>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Btn variant="ghost" disabled={!connected || !!busy} onClick={fetchR}>{busy === "fetch" ? "…" : "Fetch"}</Btn>
            <Btn variant="blue" disabled={!connected || !!busy} onClick={pull}>{busy === "pull" ? "…" : "Pull"}</Btn>
            <Btn variant="blue" disabled={!connected || !!busy} onClick={push}>{busy === "push" ? "…" : "Push"}</Btn>
            <Btn disabled={!connected || !!busy} onClick={syncAll}><span className="inline-flex items-center gap-1"><RefreshCw className={cn("h-3 w-3", busy === "sync" && "animate-spin")} />Sync</span></Btn>
          </div>
        </div>
      </Panel>

      <Panel title="Changes">
        <div className="space-y-2">
          {files.length === 0 && <p className="text-sm text-muted-foreground">Working tree clean.</p>}
          {files.map((f, i) => (
            <label key={f.path} className="flex cursor-pointer items-center gap-2 rounded border border-border px-2 py-1.5 font-mono text-xs">
              <input type="checkbox" checked={f.staged} onChange={() => setFiles(files.map((x, j) => j === i ? { ...x, staged: !x.staged } : x))} />
              <span className={cn("w-4 font-bold", statusColor[f.status])}>{f.status}</span>
              <span className="truncate">{f.path}</span>
            </label>
          ))}
          <textarea className={cn(inputCls, "h-16")} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Commit message" />
          <Btn onClick={commit} disabled={!msg.trim() || !files.some((f) => f.staged)} className="w-full">Commit to {branch}</Btn>
        </div>
      </Panel>

      <Panel title="History">
        <ul className="space-y-2">
          {commits.map((c) => (
            <li key={c.hash} className="flex items-start gap-2 text-sm">
              <GitCommit className="mt-0.5 h-4 w-4 shrink-0 text-secondary" />
              <div className="min-w-0 flex-1">
                <div className="truncate">{c.msg}</div>
                <div className="font-mono text-[10px] text-muted-foreground">{c.hash} · {c.author} · {c.time}</div>
              </div>
              {!c.pushed && <span className="rounded border border-warning/60 px-1.5 text-[10px] uppercase text-warning">queued</span>}
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Sync log">
        <pre className="max-h-56 overflow-auto whitespace-pre-wrap font-mono text-[11px] text-muted-foreground">{log.join("\n")}</pre>
      </Panel>
    </div>
  );
}
