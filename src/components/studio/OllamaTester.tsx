import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { models as modelStore } from "@/lib/models";
import { connectors } from "@/lib/connectors";
import { useDriveLink } from "@/lib/drive-link";

/**
 * Self-contained Ollama test client. Verifies the local backend, lists installed
 * models, and streams a chat response in real time (ndjson over fetch +
 * ReadableStream). No external deps or app styles — drop this file into any
 * React project. Point it at your portable server (default 127.0.0.1:11434),
 * launched with OLLAMA_ORIGINS=* so the browser may call it.
 */

const DEFAULT_URL = "http://127.0.0.1:11434";
// The studio's default coder (14B ceiling); tiny models are only a last resort.
const FALLBACK_MODEL = "qwen2.5-coder:14b";
/** Where the app's Ollama connector points (the drive routes it locally or through the tunnel). */
const routedUrl = () => (connectors.configOf("ollama")["baseUrl"] || DEFAULT_URL).replace(/\/+$/, "");

type Role = "user" | "assistant";
type Message = { role: Role; content: string };
type Status = "checking" | "connected" | "offline";
/** Speed facts from Ollama's final stream chunk. */
export type Speed = { tokPerSec: number | null; loadSec: number | null; totalSec: number | null; vramGb?: number | null };
export function speedOf(chunk: { eval_count?: number; eval_duration?: number; load_duration?: number; total_duration?: number }): Speed {
  const s = (ns?: number) => (ns ? Math.round((ns / 1e9) * 10) / 10 : null);
  return {
    tokPerSec: chunk.eval_count && chunk.eval_duration ? Math.round((chunk.eval_count / chunk.eval_duration) * 1e9 * 10) / 10 : null,
    loadSec: s(chunk.load_duration),
    totalSec: s(chunk.total_duration),
  };
}
const OFFLINE_HELP =
  "The AI engine on your drive isn't answering. Plug in the drive (it starts the engine by itself), or turn on the laptop it's in, then press Reconnect.";
type Row = { model: string; state: "waiting" | "testing" | "ok" | "failed"; speed?: Speed; note?: string };

const QUICK_PROMPTS: { label: string; prompt: string }[] = [
  { label: "Ping test", prompt: "Reply with exactly: PONG" },
  { label: "Quantum (1 sentence)", prompt: "Explain quantum computing in one sentence." },
  { label: "Python Fibonacci", prompt: "Write a Python Fibonacci script." },
];

/** Render assistant text with simple ```fenced``` code blocks. */
function renderContent(content: string): ReactNode {
  return content.split("```").map((part, i) =>
    i % 2 === 1 ? (
      <pre key={i} className="oll-code">
        <code>{part.replace(/^[\w+-]*\n/, "")}</code>
      </pre>
    ) : (
      <span key={i} style={{ whiteSpace: "pre-wrap" }}>
        {part}
      </span>
    ),
  );
}

export function OllamaTester() {
  const drive = useDriveLink();
  const [baseUrl, setBaseUrl] = useState(routedUrl);
  const [status, setStatus] = useState<Status>("checking");
  const [models, setModels] = useState<string[]>([]);
  const [model, setModel] = useState<string>(FALLBACK_MODEL);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [speed, setSpeed] = useState<Speed | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  const checkHealth = useCallback(async (url: string) => {
    setStatus("checking");
    try {
      const res = await fetch(`${url.replace(/\/$/, "")}/api/tags`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { models?: { name: string }[] };
      const names = (data.models ?? []).map((m) => m.name);
      setModels(names);
      modelStore.syncLive(names); // share the live list with the rest of the app
      setStatus("connected");
      setError(null);
      setModel((prev) =>
        prev && names.includes(prev)
          ? prev
          : names.includes(FALLBACK_MODEL)
            ? FALLBACK_MODEL
            : (names[0] ?? FALLBACK_MODEL),
      );
    } catch {
      setStatus("offline");
      setModels([]);
    }
  }, []);

  // Follow the drive: plugged in here, or reached remotely from a phone.
  useEffect(() => {
    const url = routedUrl();
    setBaseUrl(url);
    void checkHealth(url);
  }, [checkHealth, drive.mode, drive.base]);

  const appendToLast = (token: string) =>
    setMessages((prev) => {
      const next = prev.slice();
      const last = next[next.length - 1];
      if (last && last.role === "assistant")
        next[next.length - 1] = { ...last, content: last.content + token };
      return next;
    });

  const send = async (text: string) => {
    const prompt = text.trim();
    if (!prompt || streaming) return;
    setError(null);
    const history: Message[] = [...messages, { role: "user", content: prompt }];
    setMessages([...history, { role: "assistant", content: "" }]);
    setInput("");
    setStreaming(true);
    setSpeed(null);
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: model || FALLBACK_MODEL, messages: history, stream: true }),
        signal: ac.signal,
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          const t = line.trim();
          if (!t) continue;
          try {
            const chunk = JSON.parse(t) as { message?: { content?: string }; done?: boolean; eval_count?: number; eval_duration?: number; load_duration?: number; total_duration?: number };
            if (chunk.message?.content) appendToLast(chunk.message.content);
            if (chunk.done) setSpeed({ ...speedOf(chunk), vramGb: await vramOf(model || FALLBACK_MODEL) });
          } catch {
            /* ignore partial/non-JSON lines */
          }
        }
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        appendToLast("\n\n[stopped]");
      } else {
        setError(OFFLINE_HELP);
        setStatus("offline");
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  };

  const stop = () => abortRef.current?.abort();

  /** How much VRAM a loaded model uses right now. */
  const vramOf = async (tag: string): Promise<number | null> => {
    try {
      const ps = (await (await fetch(`${baseUrl.replace(/\/$/, "")}/api/ps`)).json()) as { models?: { name: string; size_vram?: number }[] };
      const m = ps.models?.find((x) => x.name === tag || x.name === `${tag}:latest`);
      return m?.size_vram ? Math.round((m.size_vram / 2 ** 30) * 10) / 10 : null;
    } catch {
      return null;
    }
  };

  /** Ask every installed model to answer PONG, one at a time, and time it. */
  const testAll = async () => {
    if (!models.length || streaming) return;
    const list = models.filter((m) => !/embed/i.test(m));
    setRows(list.map((m) => ({ model: m, state: "waiting" })));
    setStreaming(true);
    for (const m of list) {
      setRows((r) => r && r.map((x) => (x.model === m ? { ...x, state: "testing" } : x)));
      try {
        const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: m, stream: false, keep_alive: "5m", messages: [{ role: "user", content: "Reply with exactly: PONG" }] }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const j = (await res.json()) as { message?: { content?: string }; eval_count?: number; eval_duration?: number; load_duration?: number; total_duration?: number };
        const ok = /pong/i.test(j.message?.content ?? "");
        setRows((r) => r && r.map((x) => (x.model === m ? { ...x, state: ok ? "ok" : "failed", speed: speedOf(j), note: ok ? "" : "answered, but not PONG" } : x)));
      } catch (e) {
        setRows((r) => r && r.map((x) => (x.model === m ? { ...x, state: "failed", note: e instanceof Error ? e.message : "error" } : x)));
      }
    }
    setStreaming(false);
  };

  const dot = status === "connected" ? "#22c55e" : status === "offline" ? "#ef4444" : "#eab308";

  return (
    <div className="oll-root">
      <style>{CSS}</style>

      <div className="oll-bar">
        <span className="oll-status">
          <span className="oll-dot" style={{ background: dot }} />
          {status === "connected" ? "Connected" : status === "offline" ? "Offline" : "Checking…"}
        </span>
        <input
          className="oll-url"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          spellCheck={false}
          aria-label="Server URL"
        />
        <select
          className="oll-select"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          aria-label="Model"
        >
          {models.length === 0 ? (
            <option value={FALLBACK_MODEL}>{FALLBACK_MODEL} (default)</option>
          ) : (
            models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))
          )}
        </select>
        <button className="oll-btn" onClick={() => void checkHealth(baseUrl)}>
          Reconnect
        </button>
        <button className="oll-btn oll-ghost" onClick={() => void testAll()} disabled={!models.length || streaming} title="Ask every installed model to answer, and time each one">
          Test all models
        </button>
      </div>

      {rows && (
        <div className="oll-table" role="table" aria-label="Model test results">
          {rows.map((r) => (
            <div key={r.model} role="row" className="oll-row">
              <span role="cell" className="oll-mono">{r.model}</span>
              <span role="cell" className={`oll-state oll-${r.state}`}>{r.state === "ok" ? "✓ answers" : r.state === "failed" ? `✗ ${r.note ?? ""}` : r.state === "testing" ? "testing…" : "waiting"}</span>
              <span role="cell" className="oll-mono">{r.speed?.tokPerSec != null ? `${r.speed.tokPerSec} tok/s` : ""}</span>
              <span role="cell" className="oll-mono">{r.speed?.loadSec ? `load ${r.speed.loadSec}s` : ""}</span>
            </div>
          ))}
          <button className="oll-chip" onClick={() => setRows(null)}>Hide results</button>
        </div>
      )}

      {error && <div className="oll-error">{error}</div>}

      <div className="oll-chat">
        {messages.length === 0 && (
          <div className="oll-empty">
            Pick a model and send a prompt, or try a quick test below.
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "oll-msg oll-user" : "oll-msg oll-ai"}>
            <div className="oll-role">{m.role === "user" ? "you" : model}</div>
            <div className="oll-body">
              {renderContent(m.content)}
              {streaming && i === messages.length - 1 && m.role === "assistant" && (
                <span className="oll-caret" />
              )}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {speed && (
        <div className="oll-speed" aria-label="Speed">
          {speed.tokPerSec != null && <span><b>{speed.tokPerSec}</b> tokens/s</span>}
          {speed.loadSec != null && <span>loaded in <b>{speed.loadSec}s</b></span>}
          {speed.totalSec != null && <span>total <b>{speed.totalSec}s</b></span>}
          {speed.vramGb != null && <span><b>{speed.vramGb} GB</b> VRAM</span>}
        </div>
      )}

      <div className="oll-quick">
        {QUICK_PROMPTS.map((q) => (
          <button
            key={q.label}
            className="oll-chip"
            onClick={() => void send(q.prompt)}
            disabled={streaming}
          >
            {q.label}
          </button>
        ))}
      </div>

      <div className="oll-input">
        <textarea
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(input);
            }
          }}
          placeholder="Message the model…  (Enter to send, Shift+Enter for newline)"
        />
        {streaming ? (
          <button className="oll-btn oll-stop" onClick={stop}>
            Stop
          </button>
        ) : (
          <button
            className="oll-btn oll-send"
            onClick={() => void send(input)}
            disabled={!input.trim()}
          >
            Send
          </button>
        )}
      </div>
    </div>
  );
}

const CSS = `
.oll-root{display:flex;flex-direction:column;gap:10px;height:100%;min-height:520px;color:#e6e9f5;font-family:Inter,system-ui,sans-serif}
.oll-bar{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.oll-status{display:flex;align-items:center;gap:6px;font-size:13px;font-weight:600}
.oll-dot{width:10px;height:10px;border-radius:50%;box-shadow:0 0 8px currentColor}
.oll-url{flex:1;min-width:160px;background:#0c1020;border:1px solid #273150;border-radius:8px;padding:7px 10px;color:#e6e9f5;font:12px ui-monospace,monospace}
.oll-select{background:#0c1020;border:1px solid #273150;border-radius:8px;padding:7px 10px;color:#e6e9f5;font:12px ui-monospace,monospace;max-width:220px}
.oll-btn{background:#3d5afe;color:#fff;border:0;border-radius:8px;padding:8px 14px;font-size:13px;font-weight:700;cursor:pointer}
.oll-btn:disabled{opacity:.4;cursor:default}
.oll-stop{background:#ef4444}
.oll-ghost{background:transparent;border:1px solid #3d5afe;color:#9ab0ff}
.oll-table{display:flex;flex-direction:column;gap:4px;background:#080b16;border:1px solid #1b2440;border-radius:12px;padding:10px}
.oll-row{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(0,1.2fr) auto auto;gap:10px;font-size:12px;align-items:center}
.oll-mono{font:12px ui-monospace,monospace;color:#9aa4c4;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.oll-ok{color:#4ade80}.oll-failed{color:#f87171}.oll-testing{color:#facc15}.oll-waiting{color:#7f8aad}
.oll-speed{display:flex;flex-wrap:wrap;gap:14px;font-size:12px;color:#9aa4c4}
.oll-speed b{color:#e6e9f5}
.oll-error{background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.4);color:#fecaca;border-radius:10px;padding:10px 12px;font-size:13px}
.oll-chat{flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:12px;background:#080b16;border:1px solid #1b2440;border-radius:12px;padding:14px}
.oll-empty{color:#7f8aad;font-size:13px;text-align:center;margin:auto}
.oll-msg{display:flex;flex-direction:column;gap:4px;max-width:92%}
.oll-user{align-self:flex-end;align-items:flex-end}
.oll-role{font:11px ui-monospace,monospace;color:#7f8aad;text-transform:lowercase}
.oll-body{background:#111831;border:1px solid #223056;border-radius:12px;padding:10px 12px;font-size:14px;line-height:1.5}
.oll-user .oll-body{background:#1d2b63;border-color:#2c3f86}
.oll-code{background:#05070f;border:1px solid #223056;border-radius:8px;padding:10px;overflow-x:auto;margin:8px 0;font:12.5px ui-monospace,SFMono-Regular,monospace;color:#9ad5ff}
.oll-caret{display:inline-block;width:7px;height:14px;background:#00f59b;margin-left:2px;vertical-align:text-bottom;animation:oll-blink 1s steps(2) infinite}
@keyframes oll-blink{50%{opacity:0}}
.oll-quick{display:flex;flex-wrap:wrap;gap:6px}
.oll-chip{background:transparent;border:1px solid #273150;color:#9aa4c4;border-radius:999px;padding:5px 12px;font-size:12px;cursor:pointer}
.oll-chip:hover:not(:disabled){border-color:#3d5afe;color:#9ab0ff}
.oll-chip:disabled{opacity:.4;cursor:default}
.oll-input{display:flex;gap:8px;align-items:flex-end}
.oll-input textarea{flex:1;resize:none;max-height:140px;background:#0c1020;border:1px solid #273150;border-radius:10px;padding:10px 12px;color:#e6e9f5;font:14px Inter,system-ui,sans-serif;outline:none}
.oll-input textarea:focus{border-color:#3d5afe}
`;
