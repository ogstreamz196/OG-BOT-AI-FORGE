import { useCallback, useEffect, useState } from "react";
import { Bot, Copy, Eye, Lightbulb, RefreshCw, Send, Undo2, Wrench } from "lucide-react";
import { Panel, Btn } from "./ui";
import { cn } from "@/lib/utils";
import { useDriveLink } from "@/lib/drive-link";
import { errorLog, fixBrief, flush, useErrorLog } from "@/lib/error-log";
import { ideaQueue, useIdeaQueue } from "@/lib/idea-queue";

type Repair = {
  status: string;
  reason?: string | null;
  steps?: string[];
  summary?: string;
  commit?: string;
  branch?: string;
  check_tail?: string;
};
type DriveError = {
  fingerprint: string;
  kind: string;
  message: string;
  count: number;
  status: string;
  hint?: string;
  last_repair?: Repair;
};
type RepairStatus = {
  settings: { auto: boolean; push_main: boolean };
  ready: { git: boolean; bun: boolean; token: boolean; clone: boolean; repo: string };
  busy: boolean;
  errors: DriveError[];
};

const STATUS: Record<string, { label: string; cls: string }> = {
  new: { label: "waiting", cls: "text-warning" },
  fixing: { label: "OG BOT is on it", cls: "text-secondary animate-pulse" },
  fixed: { label: "fixed", cls: "text-primary" },
  auto_fixed: { label: "fixed on the spot", cls: "text-primary" },
  reverted: { label: "undone", cls: "text-muted-foreground" },
  failed: { label: "couldn't fix", cls: "text-destructive" },
  needs_owner: { label: "needs you", cls: "text-destructive" },
  blocked: { label: "blocked", cls: "text-destructive" },
};

/** OG BOT repairing the app it lives in: errors and ideas from every device, its fixes, and the owner's controls. */
export function SelfRepairPanel() {
  const d = useDriveLink();
  const local = useErrorLog();
  const queued = useIdeaQueue();
  const [st, setSt] = useState<RepairStatus | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [task, setTask] = useState("");
  const [hintFor, setHintFor] = useState<string | null>(null);
  const [hint, setHint] = useState("");
  const [diff, setDiff] = useState<{ commit: string; text: string } | null>(null);
  const base = d.mode === "local" || d.mode === "remote" ? d.base : null;

  const load = useCallback(async () => {
    if (!base) return setSt(null);
    try {
      const r = await fetch(`${base}/og/repair`);
      setSt(r.ok ? ((await r.json()) as RepairStatus) : null);
    } catch {
      setSt(null);
    }
  }, [base]);
  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 10_000);
    return () => clearInterval(id);
  }, [load]);

  const post = async (path: string, body: unknown = {}, done?: string) => {
    if (!base) return;
    try {
      const r = await fetch(`${base}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = (await r.json().catch(() => ({}))) as { result?: string; error?: string };
      setMsg(j.result ?? j.error ?? done ?? null);
    } catch {
      setMsg("couldn't reach the drive");
    }
    void load();
  };

  const showDiff = async (commit: string) => {
    if (!base) return;
    if (diff?.commit === commit) return setDiff(null);
    try {
      const r = await fetch(`${base}/og/repair/diff?commit=${encodeURIComponent(commit)}`);
      const j = (await r.json()) as { diff?: string };
      setDiff({ commit, text: j.diff ?? "not available" });
    } catch {
      setDiff({ commit, text: "couldn't reach the drive" });
    }
  };

  const sendTask = () => {
    const text = task.trim();
    if (!text) return;
    if (base)
      void post("/og/repair/idea", { text }, "OG BOT has your idea. It starts within a minute.");
    else {
      ideaQueue.add(text);
      setMsg(
        "Saved on this device. It goes to OG BOT as soon as the drive is online (open the site once it is).",
      );
    }
    setTask("");
  };

  const sendHint = (fingerprint: string) => {
    if (!hint.trim()) return;
    void post(
      "/og/repair/hint",
      { fingerprint, hint },
      "Idea added. OG BOT will try again with it.",
    );
    setHint("");
    setHintFor(null);
  };

  const ready = st?.ready;
  const missing = ready
    ? [
        !ready.token && "a GitHub key (re-pair the drive in Setup and add one)",
        !ready.git && "Git (downloads itself when online)",
        !ready.bun && "Bun (downloads itself when online)",
      ].filter(Boolean)
    : [];

  return (
    <Panel
      title="OG BOT self-repair"
      right={
        <span className="flex items-center gap-1 font-mono text-[11px] text-muted-foreground">
          <Bot className="h-3 w-3 text-primary" />
          {st?.busy ? "working…" : base ? "drive connected" : "drive not connected"}
        </span>
      }
    >
      <p className="mb-3 text-xs text-muted-foreground">
        OG BOT fixes errors from any device and builds your ideas, right on the drive. Every change
        is checked (TypeScript + all tests) before it goes live, and you can review or undo any of
        them here.
      </p>

      <div className="mb-3 text-xs">
        {/* Give OG BOT a task */}
        <div className="rounded-lg border border-primary/40 bg-primary/5 p-2">
          <label htmlFor="og-task" className="mb-1 flex items-center gap-1 font-medium">
            <Lightbulb className="h-3.5 w-3.5 text-primary" />
            Give OG BOT a task or idea
          </label>
          <div className="flex gap-2">
            <input
              id="og-task"
              value={task}
              onChange={(e) => setTask(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendTask()}
              placeholder='e.g. "Make the Settings save button bigger" or "Add a clear button to the music screen"'
              className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-1.5"
            />
            <Btn onClick={sendTask} disabled={!task.trim()}>
              <Send className="mr-1 inline h-3 w-3" />
              Send
            </Btn>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Name the screen (Create, Build, Dashboard, Settings, Music…) so OG BOT opens the right
            file.
            {!st &&
              " The drive is offline: your task waits on this device and is sent when it's back."}
          </p>
          {queued.length > 0 && (
            <ul className="mt-2 space-y-1">
              {queued.map((q) => (
                <li
                  key={q.id}
                  className="flex items-start gap-2 rounded border border-border bg-background px-2 py-1"
                >
                  <span className="min-w-0 flex-1 break-words">{q.text}</span>
                  <span className="shrink-0 font-mono text-[10px] text-warning">
                    waiting for drive
                  </span>
                  <button
                    aria-label="Remove task"
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => ideaQueue.remove(q.id)}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {st ? (
        <div className="mb-3 space-y-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 rounded border border-border px-2 py-1">
              <input
                type="checkbox"
                checked={st.settings.auto}
                onChange={(e) => void post("/og/repair/settings", { auto: e.target.checked })}
              />
              Auto-repair
            </label>
            <label
              className="flex items-center gap-1.5 rounded border border-border px-2 py-1"
              title="Off: fixes go to an ogbot/ branch for you to merge yourself"
            >
              <input
                type="checkbox"
                checked={st.settings.push_main}
                onChange={(e) => void post("/og/repair/settings", { push_main: e.target.checked })}
              />
              Publish passing fixes automatically
            </label>
            <Btn variant="ghost" onClick={() => void post("/og/repair/undo")}>
              <Undo2 className="mr-1 inline h-3 w-3" />
              Undo last fix
            </Btn>
          </div>
          {missing.length > 0 && (
            <p className="rounded border border-warning/50 bg-warning/10 px-2 py-1">
              Before OG BOT can change code it needs: {missing.join(" · ")}.
            </p>
          )}

          <ul className="space-y-1.5">
            {st.errors.length === 0 && (
              <li className="text-muted-foreground">Nothing to fix. 🎉</li>
            )}
            {st.errors.map((e) => {
              const s = STATUS[e.status] ?? {
                label: e.status.replace("_", " "),
                cls: "text-muted-foreground",
              };
              const commit = e.last_repair?.commit;
              return (
                <li key={e.fingerprint} className="rounded border border-border bg-card p-2">
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0 break-words">
                      {e.kind === "idea" ? (
                        <Lightbulb className="mr-1 inline h-3 w-3 text-primary" />
                      ) : null}
                      <span className={e.kind === "idea" ? "" : "font-mono text-[11px]"}>
                        {e.message}
                      </span>
                    </span>
                    <span className={cn("shrink-0 font-mono text-[10px] uppercase", s.cls)}>
                      {s.label}
                      {e.kind === "idea" ? "" : ` · ${e.count}×`}
                    </span>
                  </div>
                  {e.hint && <p className="mt-1 text-[11px] text-primary">Your idea: {e.hint}</p>}
                  {e.last_repair && (
                    <details className="mt-1 text-[11px] text-muted-foreground">
                      <summary className="cursor-pointer">
                        OG BOT:{" "}
                        {e.last_repair.summary || e.last_repair.reason || e.last_repair.status}
                        {commit ? ` · ${commit}` : ""}
                      </summary>
                      <ol className="mt-1 list-decimal pl-4">
                        {(e.last_repair.steps ?? []).map((x, i) => (
                          <li key={i}>{x}</li>
                        ))}
                      </ol>
                      {e.last_repair.check_tail && (
                        <pre className="mt-1 max-h-32 overflow-auto rounded bg-background p-1 text-[10px]">
                          {e.last_repair.check_tail}
                        </pre>
                      )}
                    </details>
                  )}
                  <div className="mt-1 flex flex-wrap gap-3 text-[11px]">
                    {commit && (
                      <button
                        className="text-primary hover:underline"
                        onClick={() => void showDiff(commit)}
                      >
                        <Eye className="mr-1 inline h-3 w-3" />
                        {diff?.commit === commit ? "Hide changes" : "View changes"}
                      </button>
                    )}
                    {commit && e.status === "fixed" && (
                      <button
                        className="text-destructive hover:underline"
                        onClick={() => void post("/og/repair/revert", { commit })}
                      >
                        <Undo2 className="mr-1 inline h-3 w-3" />
                        Revert this fix
                      </button>
                    )}
                    {e.status !== "fixing" && (
                      <button
                        className="text-primary hover:underline"
                        onClick={() => {
                          setHintFor(hintFor === e.fingerprint ? null : e.fingerprint);
                          setHint(e.hint ?? "");
                        }}
                      >
                        <Lightbulb className="mr-1 inline h-3 w-3" />
                        Add my idea
                      </button>
                    )}
                    {["failed", "needs_owner", "fixed", "reverted"].includes(e.status) && (
                      <button
                        className="text-primary hover:underline"
                        onClick={() =>
                          void post("/og/repair/retry", { fingerprint: e.fingerprint })
                        }
                      >
                        <RefreshCw className="mr-1 inline h-3 w-3" />
                        Try again
                      </button>
                    )}
                  </div>
                  {hintFor === e.fingerprint && (
                    <div className="mt-2 flex gap-2">
                      <input
                        autoFocus
                        value={hint}
                        onChange={(ev) => setHint(ev.target.value)}
                        onKeyDown={(ev) => ev.key === "Enter" && sendHint(e.fingerprint)}
                        placeholder="Tell OG BOT how you'd like it done, or what you think is wrong"
                        className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-1"
                      />
                      <Btn onClick={() => sendHint(e.fingerprint)} disabled={!hint.trim()}>
                        Send
                      </Btn>
                    </div>
                  )}
                  {diff && diff.commit === commit && (
                    <pre className="mt-2 max-h-72 overflow-auto rounded bg-background p-2 font-mono text-[10px] leading-relaxed">
                      {diff.text.split("\n").map((line, i) => (
                        <span
                          key={i}
                          className={cn(
                            "block",
                            line.startsWith("+") && !line.startsWith("+++") && "text-primary",
                            line.startsWith("-") && !line.startsWith("---") && "text-destructive",
                          )}
                        >
                          {line}
                        </span>
                      ))}
                    </pre>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <p className="mb-3 text-xs text-muted-foreground">
          {d.message}. OG BOT's repairs and controls show here once the drive is online.
        </p>
      )}

      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground">
          <Wrench className="mr-1 inline h-3 w-3" />
          This device's error log ({local.length}, {local.filter((e) => !e.sent).length} waiting to
          send)
        </summary>
        <ul className="mt-2 space-y-1">
          {[...local].reverse().map((e) => (
            <li
              key={e.fingerprint}
              className="flex items-start gap-2 rounded border border-border p-1.5"
            >
              <span className="min-w-0 flex-1 break-words font-mono text-[10px]">
                [{e.kind} · {e.count}×] {e.message}
                {e.healed && (
                  <span className="block text-primary">fixed on the spot: {e.healed}</span>
                )}
              </span>
              <button
                title="Copy fix brief"
                aria-label="Copy fix brief"
                onClick={() => void navigator.clipboard?.writeText(fixBrief(e))}
                className="shrink-0 text-muted-foreground hover:text-primary"
              >
                <Copy className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex gap-2">
          <Btn
            variant="ghost"
            onClick={() =>
              void flush().then((n) =>
                setMsg(n ? `sent ${n} to the drive` : "nothing to send / drive not connected"),
              )
            }
          >
            Send to drive now
          </Btn>
          <Btn variant="ghost" onClick={() => errorLog.clear()}>
            Clear
          </Btn>
        </div>
      </details>
      {msg && (
        <p className="mt-2 font-mono text-[11px] text-muted-foreground" role="status">
          {msg}
        </p>
      )}
    </Panel>
  );
}
