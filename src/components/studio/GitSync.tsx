import { useCallback, useEffect, useState } from "react";
import { Bot, Eye, GitCommit, RefreshCw, Undo2 } from "lucide-react";
import { Panel, Btn } from "./ui";
import { cn } from "@/lib/utils";
import { useDriveLink } from "@/lib/drive-link";

type Commit = { sha: string; short: string; author: string; time: number; subject: string; reverted?: boolean };

export function ago(seconds: number, now = Date.now() / 1000): string {
  const s = Math.max(0, Math.round(now - seconds));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

/** Who made a change, in plain words. */
export function whoMade(author: string, subject: string): string {
  if (author === "OG BOT") return "OG BOT";
  if (/lovable/i.test(author) || /lovable/i.test(subject)) return "Lovable";
  if (/claude/i.test(author)) return "Claude";
  return author;
}

/**
 * Change history: the real commits on the app's main branch (read through the drive's copy),
 * so the owner can see every change, look at what it did, and undo any of them.
 */
export function GitSync() {
  const d = useDriveLink();
  const base = d.mode === "local" || d.mode === "remote" ? d.base : null;
  const [commits, setCommits] = useState<Commit[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState<{ sha: string; text: string } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!base) return;
    setLoading(true);
    try {
      const r = await fetch(`${base}/og/git/log`);
      const j = (await r.json()) as { commits?: Commit[]; error?: string };
      setCommits(j.commits ?? []);
      setError(j.error ?? (r.ok ? null : `drive answered ${r.status}`));
    } catch {
      setError("couldn't reach the drive");
    } finally {
      setLoading(false);
    }
  }, [base]);
  useEffect(() => {
    void load();
  }, [load]);

  const view = async (sha: string) => {
    if (!base) return;
    if (open?.sha === sha) return setOpen(null);
    try {
      const j = (await (await fetch(`${base}/og/repair/diff?commit=${sha}`)).json()) as { diff?: string };
      setOpen({ sha, text: j.diff ?? "not available" });
    } catch {
      setOpen({ sha, text: "couldn't reach the drive" });
    }
  };

  const revert = async (c: Commit) => {
    if (!base || !window.confirm(`Undo "${c.subject}"?\n\nOG BOT adds an undo commit on main and Lovable publishes it. You can undo the undo the same way.`)) return;
    setMsg("undoing…");
    try {
      const r = await fetch(`${base}/og/repair/revert`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ commit: c.sha }) });
      const j = (await r.json()) as { result?: string };
      setMsg(j.result ?? "done");
    } catch {
      setMsg("couldn't reach the drive");
    }
    void load();
  };

  if (!base) {
    return (
      <Panel title="Change history">
        <p className="text-xs text-muted-foreground">
          Plug in the drive (or sign in as D.EV to reach it remotely). The drive keeps a copy of the app's code, so you can see every change made to the site here and undo any of them.
        </p>
      </Panel>
    );
  }

  return (
    <div className="space-y-3">
      <Panel
        title="Change history · main"
        right={
          <Btn variant="ghost" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={cn("mr-1 inline h-3 w-3", loading && "animate-spin")} />Refresh
          </Btn>
        }
      >
        <p className="mb-3 text-xs text-muted-foreground">
          Every change to the live site, newest first: OG BOT's fixes, Lovable, Claude and your own. "Undo" adds a new commit that reverses it, so nothing is ever lost.
        </p>
        {error && <p className="mb-2 rounded border border-warning/50 bg-warning/10 px-2 py-1 text-xs">{error}</p>}
        {msg && <p className="mb-2 font-mono text-[11px] text-muted-foreground" role="status">{msg}</p>}
        {commits === null ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : commits.length === 0 ? (
          <p className="text-xs text-muted-foreground">No changes found.</p>
        ) : (
          <ul className="space-y-1.5 text-xs">
            {commits.map((c) => {
              const who = whoMade(c.author, c.subject);
              return (
                <li key={c.sha} className={cn("rounded border border-border bg-card p-2", c.reverted && "opacity-60")}>
                  <div className="flex items-start gap-2">
                    {who === "OG BOT" ? <Bot className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" /> : <GitCommit className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                    <div className="min-w-0 flex-1">
                      <p className={cn("break-words", c.reverted && "line-through")}>{c.subject}</p>
                      <p className="font-mono text-[10px] text-muted-foreground">
                        {who} · {ago(c.time)} · {c.short}
                        {c.reverted ? " · undone" : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2 text-[11px]">
                      <button className="text-primary hover:underline" onClick={() => void view(c.sha)}>
                        <Eye className="mr-0.5 inline h-3 w-3" />{open?.sha === c.sha ? "Hide" : "View"}
                      </button>
                      {!c.reverted && (
                        <button className="text-destructive hover:underline" onClick={() => void revert(c)}>
                          <Undo2 className="mr-0.5 inline h-3 w-3" />Undo
                        </button>
                      )}
                    </div>
                  </div>
                  {open?.sha === c.sha && (
                    <pre className="mt-2 max-h-80 overflow-auto rounded bg-background p-2 font-mono text-[10px] leading-relaxed">
                      {open.text.split("\n").map((line, i) => (
                        <span key={i} className={cn("block", line.startsWith("+") && !line.startsWith("+++") && "text-primary", line.startsWith("-") && !line.startsWith("---") && "text-destructive")}>{line}</span>
                      ))}
                    </pre>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}
