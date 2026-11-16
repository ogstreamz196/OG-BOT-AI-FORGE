import { useEffect, useMemo, useRef, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { python } from "@codemirror/lang-python";
import { sql } from "@codemirror/lang-sql";
import { json } from "@codemirror/lang-json";
import { oneDark } from "@codemirror/theme-one-dark";
import {
  Brain,
  Code2,
  Copy,
  Download,
  Eye,
  FileCode,
  Hammer,
  HardDrive,
  Loader2,
  Plus,
  Send,
  Square,
  Terminal,
  Trash2,
  X,
} from "lucide-react";
import { Btn, inputCls } from "./ui";
import { SplitView } from "./SplitView";
import { cn } from "@/lib/utils";
import { connectors, useConnectors } from "@/lib/connectors";
import { usePersistentState } from "@/hooks/use-persistent-state";
import { setActiveModel } from "@/lib/engine-status";
import { workspace } from "@/lib/workspace";
import { streamOllama, OLLAMA_URL, type ChatMsg } from "@/lib/mv-pipeline";
import {
  DEV_MODES,
  DEV_SUITE,
  DEV_SAMPLES,
  langFor,
  parseFiles,
  previewDoc,
  previewable,
  restoreBatch,
  splitThink,
  type DevMode,
  type GenFile,
} from "@/lib/dev-workbench";
import { report } from "@/lib/error-log";
import { useDriveLink } from "@/lib/drive-link";

type Turn = { role: "user" | "assistant"; text: string; model?: string };

function extFor(name: string) {
  const l = langFor(name);
  if (l === "typescript" || l === "tsx")
    return [javascript({ typescript: true, jsx: l === "tsx" })];
  if (l === "javascript" || l === "jsx") return [javascript({ jsx: l === "jsx" })];
  if (l === "html") return [html()];
  if (l === "css") return [css()];
  if (l === "python") return [python()];
  if (l === "sql") return [sql()];
  if (l === "json") return [json()];
  return [];
}

function save(name: string, content: string, crlf = false) {
  const url = URL.createObjectURL(
    new Blob([crlf ? content.replace(/\r?\n/g, "\r\n") : content], {
      type: "application/octet-stream",
    }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name.split("/").pop() || name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

/** Merge freshly parsed files into the tabs: same name → replace, new name → new tab. */
function merge(tabs: GenFile[], incoming: GenFile[]): GenFile[] {
  const out = [...tabs];
  for (const f of incoming) {
    const i = out.findIndex((t) => t.name === f.name);
    if (i >= 0) out[i] = f;
    else out.push(f);
  }
  return out;
}

export function DevWorkbench() {
  useConnectors();
  const base = connectors.configOf("ollama")["baseUrl"]?.trim() || OLLAMA_URL;
  const [mode, setMode] = usePersistentState<DevMode>("og-dev-mode", "fullstack");
  const [model, setModel] = usePersistentState("og-dev-model", DEV_MODES.fullstack.model);
  const [turns, setTurns] = usePersistentState<Turn[]>("og-dev-turns", []);
  const [files, setFiles] = usePersistentState<GenFile[]>("og-dev-files", []);
  const [active, setActive] = usePersistentState("og-dev-active", "");
  const [view, setView] = usePersistentState<"code" | "preview">("og-dev-view", "code");
  const [q, setQ] = useState("");
  const drive = useDriveLink();
  const driveBase = drive.mode === "local" || drive.mode === "remote" ? drive.base : null;
  const [projectName, setProjectName] = usePersistentState("og-dev-project", "dev-project");
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const saveToDrive = async () => {
    if (!driveBase) return;
    setSaveMsg("Saving…");
    try {
      const r = await fetch(`${driveBase}/og/projects/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project: projectName,
          files: files.map((f) => ({ name: f.name, content: f.content })),
        }),
      });
      const j = (await r.json()) as {
        ok?: boolean;
        folder?: string;
        written?: string[];
        error?: string;
      };
      setSaveMsg(
        j.ok
          ? `Saved ${j.written?.length ?? 0} file(s) to ${j.folder}`
          : `Not saved: ${j.error ?? r.status}`,
      );
    } catch {
      setSaveMsg("Couldn't reach the drive.");
    }
  };
  const [live, setLive] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => setActiveModel(model), [model]);
  useEffect(() => {
    end.current?.scrollIntoView?.({ block: "nearest" });
  }, [turns.length, live]);

  const pickMode = (m: DevMode) => {
    setMode(m);
    setModel(DEV_MODES[m].model);
  };
  const current = files.find((f) => f.name === active) ?? files[0];
  const canPreview = previewable(files);
  const doc = useMemo(() => (canPreview ? previewDoc(files) : ""), [files, canPreview]);

  const send = async () => {
    const prompt = q.trim();
    if (!prompt || busy) return;
    setQ("");
    setErr(null);
    setBusy(true);
    const ctl = new AbortController();
    abort.current = ctl;
    const context =
      mode === "refactor" && files.length
        ? `\n\nCurrent files:\n${files.map((f) => `### \`${f.name}\`\n\`\`\`${f.lang}\n${f.content}\n\`\`\``).join("\n\n")}`
        : "";
    const history: ChatMsg[] = turns
      .slice(-6)
      .map((t) => ({ role: t.role, content: splitThink(t.text).answer.slice(0, 6000) }));
    setTurns((t) => [...t, { role: "user", text: prompt }]);
    let text = "";
    let frame = 0;
    const flush = () => {
      frame = 0;
      setLive(text);
      const parsed = parseFiles(splitThink(text).answer);
      if (parsed.length) {
        setFiles((cur) => merge(cur, parsed));
        setActive((a) =>
          a && parsed.some((p) => p.name === a) ? a : parsed[parsed.length - 1]!.name,
        );
      }
    };
    try {
      await streamOllama({
        baseUrl: base,
        model,
        signal: ctl.signal,
        temperature: mode === "fullstack" ? 0.2 : 0.4,
        messages: [
          { role: "system", content: DEV_MODES[mode].system },
          ...history,
          { role: "user", content: prompt + context },
        ],
        onToken: (tok) => {
          text += tok;
          if (!frame) frame = requestAnimationFrame(flush); // render once per frame: smooth even at 80+ tok/s
        },
      });
    } catch (e) {
      if (!ctl.signal.aborted) {
        setErr(e instanceof Error ? e.message : String(e));
        report("engine", e, { tool: "dev", model, mode });
      }
    } finally {
      if (frame) cancelAnimationFrame(frame);
      flush();
      setTurns((t) => [...t, { role: "assistant", text, model }]);
      setLive("");
      setBusy(false);
      abort.current = null;
    }
  };

  const toBuild = () => {
    const web = files.filter((f) =>
      /^(index\.html|styles\.css|app\.js)$/i.test(f.name.split("/").pop() ?? ""),
    );
    if (web.length)
      workspace.writeFiles(
        Object.fromEntries(web.map((f) => [f.name.split("/").pop()!, f.content])),
      );
  };

  const chat = (
    <div className="flex h-full flex-col">
      <div className="space-y-2 border-b border-border p-2">
        <div className="flex flex-wrap gap-1">
          {(Object.keys(DEV_MODES) as DevMode[]).map((m) => {
            const Icon = m === "refactor" ? Brain : m === "fullstack" ? Code2 : Terminal;
            return (
              <button
                key={m}
                onClick={() => pickMode(m)}
                className={cn(
                  "flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                  mode === m
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-3 w-3" /> {DEV_MODES[m].label}
              </button>
            );
          })}
        </div>
        <p
          className={cn(
            "text-[11px]",
            mode === "automation" ? "text-warning" : "text-muted-foreground",
          )}
        >
          {DEV_MODES[mode].what}
        </p>
        <select
          aria-label="Model"
          className={inputCls}
          value={model}
          onChange={(e) => setModel(e.target.value)}
        >
          {DEV_SUITE.map((m) => (
            <option key={m.tag} value={m.tag}>
              {m.tag} · {m.role}
            </option>
          ))}
        </select>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-auto p-3 text-xs">
        {turns.length === 0 && !live && (
          <p className="text-muted-foreground">{DEV_MODES[mode].hint}</p>
        )}
        {[...turns, ...(live ? [{ role: "assistant" as const, text: live, model }] : [])].map(
          (t, i) => {
            if (t.role === "user")
              return (
                <div key={i} className="ml-6 whitespace-pre-wrap rounded-lg bg-secondary/15 p-2">
                  {t.text}
                </div>
              );
            const { think, answer, thinking } = splitThink(t.text);
            const prose = answer.replace(
              /```[\s\S]*?(```|$)/g,
              (m) => `[code → ${parseFiles(m)[0]?.name ?? "tab"}]`,
            );
            return (
              <div key={i} className="space-y-1">
                <div className="font-mono text-[10px] text-muted-foreground">{t.model}</div>
                {think && (
                  <details open={thinking} className="rounded border border-border bg-card p-2">
                    <summary className="cursor-pointer text-[11px] text-secondary">
                      {thinking
                        ? "Thinking…"
                        : `Thought chain (${think.split(/\s+/).length} words)`}
                    </summary>
                    <div className="mt-1 whitespace-pre-wrap text-muted-foreground">{think}</div>
                  </details>
                )}
                {prose.trim() && <div className="whitespace-pre-wrap">{prose.trim()}</div>}
              </div>
            );
          },
        )}
        {busy && !live && <div className="animate-pulse text-primary">Loading {model}…</div>}
        {err && (
          <div role="alert" className="font-mono text-destructive">
            {err}
          </div>
        )}
        <div ref={end} />
      </div>
      <div className="flex gap-2 border-t border-border p-2">
        <textarea
          aria-label="Prompt"
          className={cn(inputCls, "min-h-[60px] flex-1 resize-none")}
          placeholder={DEV_MODES[mode].hint}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void send();
          }}
        />
        <div className="flex flex-col gap-1">
          {busy ? (
            <Btn variant="danger" onClick={() => abort.current?.abort()}>
              <Square className="h-3 w-3" />
            </Btn>
          ) : (
            <Btn
              onClick={() => void send()}
              disabled={!q.trim()}
              className="flex items-center gap-1"
            >
              <Send className="h-3 w-3" />
            </Btn>
          )}
          <Btn variant="ghost" onClick={() => setTurns([])} disabled={busy} className="px-2">
            <Trash2 className="h-3 w-3" />
          </Btn>
        </div>
      </div>
    </div>
  );

  const workspacePane = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 overflow-x-auto border-b border-border px-1 py-1 [scrollbar-width:thin]">
        {files.map((f) => (
          <button
            key={f.name}
            onClick={() => {
              setActive(f.name);
              setView("code");
            }}
            className={cn(
              "group flex shrink-0 items-center gap-1 rounded px-2 py-1 font-mono text-[11px]",
              current?.name === f.name
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground",
            )}
          >
            <FileCode className="h-3 w-3" />
            {f.name}
            {!f.complete && busy && <Loader2 className="h-3 w-3 animate-spin" />}
            <X
              className="h-3 w-3 opacity-50 hover:opacity-100"
              aria-label={`Close ${f.name}`}
              onClick={(e) => {
                e.stopPropagation();
                setFiles(files.filter((x) => x.name !== f.name));
              }}
            />
          </button>
        ))}
        <button
          title="New file"
          aria-label="New file"
          onClick={() => {
            const n = prompt("File name", "notes.md");
            if (n) {
              setFiles([...files, { name: n, lang: langFor(n), content: "", complete: true }]);
              setActive(n);
            }
          }}
          className="shrink-0 rounded p-1 text-muted-foreground hover:text-primary"
        >
          <Plus className="h-4 w-4" />
        </button>
        <div className="ml-auto flex shrink-0 rounded-full border border-border text-[11px]">
          <button
            onClick={() => setView("code")}
            className={cn(
              "flex items-center gap-1 rounded-full px-2 py-0.5",
              view === "code" ? "bg-primary/15 text-primary" : "text-muted-foreground",
            )}
          >
            <Code2 className="h-3 w-3" />
            Code
          </button>
          <button
            onClick={() => setView("preview")}
            className={cn(
              "flex items-center gap-1 rounded-full px-2 py-0.5",
              view === "preview" ? "bg-primary/15 text-primary" : "text-muted-foreground",
            )}
          >
            <Eye className="h-3 w-3" />
            Preview
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        {view === "preview" ? (
          canPreview ? (
            <iframe
              title="Live preview"
              sandbox="allow-scripts allow-forms allow-modals"
              srcDoc={doc}
              className="h-full w-full bg-white"
            />
          ) : (
            <div className="p-4 text-xs text-muted-foreground">
              No web page to preview yet. Ask for an <code>index.html</code> (with CSS/JS) and it
              renders here live while it streams.
            </div>
          )
        ) : current ? (
          <CodeMirror
            value={current.content}
            height="100%"
            className="h-full text-[13px]"
            theme={oneDark}
            extensions={extFor(current.name)}
            onChange={(v) =>
              setFiles(files.map((f) => (f.name === current.name ? { ...f, content: v } : f)))
            }
          />
        ) : (
          <div className="space-y-3 p-4 text-xs text-muted-foreground">
            <p>
              Generated files open here as tabs. Paste your own code with + to refactor it, or start
              from one of these:
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {DEV_SAMPLES.map((ex) => (
                <button
                  key={ex}
                  onClick={() => {
                    setQ(ex);
                    if (/^Refactor/.test(ex)) pickMode("refactor");
                    else if (/PowerShell|script/i.test(ex)) pickMode("automation");
                    else pickMode("fullstack");
                  }}
                  className="og-hairline rounded-xl bg-card/50 p-3 text-left text-foreground/90 transition hover:bg-primary/10"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-1 border-t border-border p-2">
        <Btn
          variant="ghost"
          disabled={!current}
          onClick={() => current && void navigator.clipboard?.writeText(current.content)}
        >
          <Copy className="mr-1 inline h-3 w-3" />
          Copy
        </Btn>
        <Btn
          variant="ghost"
          disabled={!current}
          onClick={() => current && save(current.name, current.content)}
        >
          <Download className="mr-1 inline h-3 w-3" />
          Download file
        </Btn>
        {driveBase ? (
          <span className="flex items-center gap-1">
            <input
              aria-label="Project folder name"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value.replace(/[^\w.-]/g, "-"))}
              className="w-32 rounded-lg border border-border bg-background px-2 py-1 text-[11px]"
            />
            <Btn
              variant="ghost"
              disabled={!files.length || !projectName}
              onClick={() => void saveToDrive()}
            >
              <HardDrive className="mr-1 inline h-3 w-3" />
              Save to drive
            </Btn>
          </span>
        ) : (
          <Btn
            variant="ghost"
            disabled={!files.length}
            onClick={() => save("write_files.bat", restoreBatch(files), true)}
            title="Plug in the drive to save straight to it"
          >
            <Hammer className="mr-1 inline h-3 w-3" />
            Generate Batch Script
          </Btn>
        )}
        {saveMsg && (
          <span className="self-center text-[11px] text-muted-foreground" role="status">
            {saveMsg}
          </span>
        )}
        {files.some((f) =>
          /^(index\.html|styles\.css|app\.js)$/i.test(f.name.split("/").pop() ?? ""),
        ) && (
          <Btn variant="ghost" onClick={toBuild}>
            Open in Build
          </Btn>
        )}
      </div>
    </div>
  );

  return (
    <SplitView
      id="dev"
      left={chat}
      right={workspacePane}
      leftLabel="Chat"
      rightLabel="Code & Preview"
    />
  );
}
