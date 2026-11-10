import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  Clapperboard,
  Copy,
  Download,
  Film,
  Loader2,
  Music2,
  Play,
  RefreshCw,
  Send,
  Square,
  Terminal,
  Wand2,
} from "lucide-react";
import { Panel, Btn, inputCls } from "./ui";
import { cn } from "@/lib/utils";
import { connectors, useConnectors } from "@/lib/connectors";
import { usePersistentState } from "@/hooks/use-persistent-state";
import { pingComfy, queueComfy } from "@/lib/music-video";
import {
  DEFAULT_SUNO_BODY,
  DIRECTOR_ENGINES,
  LYRIC_ENGINES,
  OLLAMA_URL,
  comfyBatch,
  fillSunoBody,
  lyricsSystemPrompt,
  lyricsUserPrompt,
  listOllama,
  parseLyrics,
  parseStoryboard,
  pickInstalled,
  sameTag,
  sceneCount,
  stitchBatch,
  storyboardPrompt,
  streamOllama,
  type LyricStyle,
  type StoryScene,
  type VideoEngine,
} from "@/lib/mv-pipeline";

function download(name: string, content: string, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
const copy = (t: string) => void navigator.clipboard?.writeText(t).catch(() => {});

type Health = { state: "checking" | "online" | "offline"; detail: string };

function Dot({ label, h, onRetry }: { label: string; h: Health; onRetry?: () => void }) {
  const color = h.state === "online" ? "#22c55e" : h.state === "checking" ? "#eab308" : "#ef4444";
  return (
    <span className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 font-mono text-[11px]">
      <span
        className={cn("h-2 w-2 rounded-full", h.state === "checking" && "animate-pulse")}
        style={{ background: color, boxShadow: `0 0 8px ${color}` }}
      />
      {label}: <span className="text-muted-foreground">{h.detail}</span>
      {h.state === "offline" && onRetry && (
        <button onClick={onRetry} className="ml-1 text-primary hover:underline" title="Reconnect">
          <RefreshCw className="inline h-3 w-3" /> reconnect
        </button>
      )}
    </span>
  );
}

function Stage({
  n,
  title,
  icon,
  right,
  children,
}: {
  n: string;
  title: string;
  icon: ReactNode;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Panel
      title={`${n} · ${title}`}
      right={
        <div className="flex items-center gap-2">
          {right}
          {icon}
        </div>
      }
    >
      <div className="space-y-3">{children}</div>
    </Panel>
  );
}

const label = "block text-[11px] text-muted-foreground";

export function MusicVideo({ initialPrompt }: { initialPrompt?: string } = {}) {
  useConnectors();
  const ollamaUrl = connectors.configOf("ollama")["baseUrl"]?.trim() || OLLAMA_URL;
  const comfyUrl = connectors.configOf("comfyui")["baseUrl"]?.trim() || "http://127.0.0.1:8188";

  // ── engine health (auto-reconnect) ──
  const [installed, setInstalled] = useState<string[]>([]);
  const [ollama, setOllama] = useState<Health>({ state: "checking", detail: "connecting…" });
  const [comfy, setComfy] = useState<Health>({ state: "checking", detail: "connecting…" });
  const checkEngines = useCallback(async () => {
    setOllama((h) => (h.state === "online" ? h : { state: "checking", detail: "connecting…" }));
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 8000);
    try {
      const m = await listOllama(ollamaUrl, ctl.signal);
      setInstalled(m);
      setOllama({ state: "online", detail: `${m.length} models` });
    } catch (e) {
      setOllama({
        state: "offline",
        detail: ctl.signal.aborted
          ? "no answer: is Ollama running? allow local network access"
          : e instanceof Error
            ? e.message
            : "offline",
      });
    } finally {
      clearTimeout(t);
    }
    setComfy(
      (await pingComfy(comfyUrl))
        ? { state: "online", detail: "ready" }
        : { state: "offline", detail: "not running (staged mode)" },
    );
  }, [ollamaUrl, comfyUrl]);
  useEffect(() => {
    void checkEngines();
  }, [checkEngines]);
  useEffect(() => {
    // Retry every 10 s while offline, re-check every 60 s while online.
    const id = setInterval(() => void checkEngines(), ollama.state === "offline" ? 10_000 : 60_000);
    return () => clearInterval(id);
  }, [checkEngines, ollama.state]);
  const has = (tag: string) => installed.some((i) => sameTag(i, tag));
  const missing = (tag: string) => ollama.state === "online" && !has(tag);

  // ── Stage A state ──
  const [genre, setGenre] = usePersistentState("og-mv-genre", "synthwave");
  const [bpm, setBpm] = usePersistentState("og-mv-bpm", 110);
  const [duration, setDuration] = usePersistentState("og-mv-duration", 90);
  const [themes, setThemes] = usePersistentState(
    "og-mv-themes",
    initialPrompt?.trim() || "neon night drive, rain, chasing a lost signal",
  );
  const [lyricModel, setLyricModel] = usePersistentState(
    "og-mv-lyric-model",
    LYRIC_ENGINES[0]!.tag,
  );
  const [raw, setRaw] = usePersistentState("og-mv-lyrics-raw", "");
  const lyrics = parseLyrics(raw);
  const style: LyricStyle = LYRIC_ENGINES.find((e) => e.tag === lyricModel)?.style ?? "cinematic";

  // Suno (provider-agnostic). The key stays in memory only.
  const [sunoUrl, setSunoUrl] = usePersistentState(
    "og-mv-suno-url",
    connectors.configOf("suno")["endpoint"] ?? "",
  );
  const [sunoBody, setSunoBody] = usePersistentState("og-mv-suno-body", DEFAULT_SUNO_BODY);
  const [sunoKey, setSunoKey] = useState("");
  const [sunoOut, setSunoOut] = useState("");
  const [audioFile, setAudioFile] = usePersistentState("og-mv-audio", "suno_track.mp3");

  // ── Stage B state ──
  const [dirModel, setDirModel] = usePersistentState("og-mv-dir-model", DIRECTOR_ENGINES[0]!.tag);
  const [cut, setCut] = usePersistentState("og-mv-cut", 5);
  const [look, setLook] = usePersistentState(
    "og-mv-look",
    "35mm anamorphic, volumetric cyan and amber light, cinematic grain",
  );
  const [scenes, setScenes] = usePersistentState<StoryScene[]>("og-mv-scenes", []);
  const [dirRaw, setDirRaw] = useState("");

  // ── Stage C/D state ──
  const [vEngine, setVEngine] = usePersistentState<VideoEngine>("og-mv-vengine", "ltxv");
  const [template, setTemplate] = usePersistentState("og-mv-template", "");
  const [done, setDone] = usePersistentState<number[]>("og-mv-done", []);
  const [queued, setQueued] = useState<Record<number, string>>({});
  const [ffmpeg, setFfmpeg] = usePersistentState("og-mv-ffmpeg", "ffmpeg");
  const [folder, setFolder] = usePersistentState("og-mv-folder", "");

  // Pick installed models once Ollama reports them (only if the saved choice isn't installed).
  useEffect(() => {
    if (ollama.state !== "online") return;
    if (!has(lyricModel)) setLyricModel(pickInstalled(LYRIC_ENGINES, installed));
    if (!has(dirModel)) setDirModel(pickInstalled(DIRECTOR_ENGINES, installed));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ollama.state, installed.join("|")]);

  // ── running ──
  const [busy, setBusy] = useState<null | "lyrics" | "story" | "suno" | "queue" | "all">(null);
  const [err, setErr] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const stop = () => abort.current?.abort();
  const fail = (e: unknown, ctl: AbortController) =>
    setErr(ctl.signal.aborted ? "Stopped." : e instanceof Error ? e.message : String(e));

  const genLyrics = async (): Promise<string | null> => {
    const ctl = new AbortController();
    abort.current = ctl;
    setErr(null);
    setRaw("");
    try {
      return await streamOllama({
        baseUrl: ollamaUrl,
        model: lyricModel,
        signal: ctl.signal,
        temperature: style === "gritty" ? 0.95 : 0.8,
        messages: [
          { role: "system", content: lyricsSystemPrompt(style) },
          {
            role: "user",
            content: lyricsUserPrompt({ genre, bpm, themes, durationSec: duration, style }),
          },
        ],
        onToken: (t) => setRaw((r) => r + t),
      });
    } catch (e) {
      fail(e, ctl);
      return null;
    }
  };

  const genStory = async (lyricText: string): Promise<StoryScene[] | null> => {
    const ctl = new AbortController();
    abort.current = ctl;
    setErr(null);
    setDirRaw("");
    try {
      const out = await streamOllama({
        baseUrl: ollamaUrl,
        model: dirModel,
        json: true,
        temperature: 0.4,
        signal: ctl.signal,
        messages: [
          {
            role: "user",
            content: storyboardPrompt({
              lyrics: lyricText,
              bpm,
              durationSec: duration,
              cutSec: cut,
              look,
            }),
          },
        ],
        onToken: (t) => setDirRaw((r) => r + t),
      });
      const parsed = parseStoryboard(out, cut);
      if (!parsed.length)
        throw new Error(
          "The director's answer wasn't valid storyboard JSON. Try again or switch to mistral-nemo:12b.",
        );
      setScenes(parsed);
      setDone([]);
      setQueued({});
      return parsed;
    } catch (e) {
      fail(e, ctl);
      return null;
    }
  };

  const batch = () => {
    try {
      return comfyBatch(vEngine, scenes, {
        cutSec: cut,
        ...(vEngine === "custom" ? { template } : {}),
      });
    } catch {
      setErr("Your custom workflow isn't valid JSON after filling the placeholders.");
      return null;
    }
  };

  const queueAll = async (list: StoryScene[] = scenes) => {
    const items =
      list === scenes
        ? batch()
        : comfyBatch(vEngine, list, { cutSec: cut, ...(vEngine === "custom" ? { template } : {}) });
    if (!items) return;
    for (const it of items) {
      const r = await queueComfy(comfyUrl, it.prompt);
      setQueued((q) => ({ ...q, [it.scene_id]: r.ok ? "queued" : r.message }));
    }
  };

  const run = async (what: NonNullable<typeof busy>, fn: () => Promise<unknown>) => {
    setBusy(what);
    try {
      await fn();
    } finally {
      setBusy(null);
      abort.current = null;
    }
  };

  const runAll = () =>
    run("all", async () => {
      const text = await genLyrics();
      if (!text) return;
      const list = await genStory(parseLyrics(text).lyrics || text);
      if (list && comfy.state === "online") await queueAll(list);
    });

  const sendSuno = () =>
    run("suno", async () => {
      setErr(null);
      setSunoOut("");
      try {
        const body = fillSunoBody(sunoBody, {
          title: lyrics.title || themes.slice(0, 60),
          style: lyrics.styleTags || `${genre}, ${bpm} BPM`,
          lyrics: lyrics.lyrics,
        });
        JSON.parse(body);
        const res = await fetch(sunoUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(sunoKey ? { Authorization: `Bearer ${sunoKey}` } : {}),
          },
          body,
        });
        const text = await res.text();
        setSunoOut(`HTTP ${res.status}\n${text.slice(0, 4000)}`);
      } catch (e) {
        setErr(
          e instanceof SyntaxError
            ? "The Suno request body isn't valid JSON."
            : `Suno request failed: ${e instanceof Error ? e.message : e} (the provider may block browser calls: CORS)`,
        );
      }
    });

  const script = stitchBatch(scenes, { ffmpeg, audio: audioFile, folder });
  const pct = scenes.length ? Math.round((done.length / scenes.length) * 100) : 0;
  const offline = ollama.state !== "online";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Dot label="Ollama" h={ollama} onRetry={() => void checkEngines()} />
        <Dot label="ComfyUI" h={comfy} onRetry={() => void checkEngines()} />
        <div className="ml-auto flex gap-2">
          {busy ? (
            <Btn variant="danger" onClick={stop}>
              <Square className="mr-1 inline h-3 w-3" />
              Stop
            </Btn>
          ) : (
            <Btn onClick={runAll} disabled={offline} className="flex items-center gap-1">
              <Play className="h-3 w-3" />
              Run full pipeline
            </Btn>
          )}
        </div>
      </div>
      {offline && ollama.state === "offline" && (
        <p className="rounded border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs">
          Ollama isn't reachable at <code>{ollamaUrl}</code>. Start <code>start_ollama.bat</code>{" "}
          (it sets <code>OLLAMA_ORIGINS=*</code>), allow this site to access your local network in
          the browser, and it reconnects automatically. Stages C and D still work offline.
        </p>
      )}
      {err && (
        <p
          role="alert"
          className="rounded border border-destructive/50 bg-destructive/10 px-3 py-2 font-mono text-xs text-destructive"
        >
          {err}
        </p>
      )}

      <div className="grid gap-3 xl:grid-cols-2">
        {/* ── Stage A ── */}
        <Stage
          n="A"
          title="Lyrics & Track Structure"
          icon={<Music2 className="h-4 w-4 text-primary" />}
        >
          <div className="grid grid-cols-3 gap-2">
            <label className={label}>
              Genre
              <input
                className={inputCls}
                value={genre}
                onChange={(e) => setGenre(e.target.value)}
              />
            </label>
            <label className={label}>
              BPM
              <input
                type="number"
                min={40}
                max={220}
                className={inputCls}
                value={bpm}
                onChange={(e) => setBpm(Number(e.target.value) || 100)}
              />
            </label>
            <label className={label}>
              Length (s)
              <input
                type="number"
                min={10}
                max={600}
                className={inputCls}
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value) || 90)}
              />
            </label>
          </div>
          <label className={label}>
            Core themes
            <input
              className={inputCls}
              value={themes}
              onChange={(e) => setThemes(e.target.value)}
            />
          </label>
          <label className={label}>
            Lyric engine
            <select
              className={inputCls}
              value={lyricModel}
              onChange={(e) => setLyricModel(e.target.value)}
            >
              {LYRIC_ENGINES.map((m) => (
                <option key={m.tag} value={m.tag}>
                  {m.label} ({m.tag}){missing(m.tag) ? " · not installed" : ""}
                </option>
              ))}
            </select>
          </label>
          <Btn
            onClick={() => void run("lyrics", genLyrics)}
            disabled={!!busy || offline}
            className="flex w-full items-center justify-center gap-1"
          >
            {busy === "lyrics" ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Wand2 className="h-3 w-3" />
            )}
            Write lyrics
          </Btn>
          <textarea
            className={cn(inputCls, "min-h-[180px]")}
            placeholder="Lyrics appear here as they're written; you can edit them."
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
          />
          {(lyrics.title || lyrics.sections.length > 0) && (
            <div className="space-y-1 text-xs">
              {lyrics.title && (
                <div>
                  <span className="text-muted-foreground">Title:</span> {lyrics.title}
                </div>
              )}
              {lyrics.styleTags && (
                <div>
                  <span className="text-muted-foreground">Style:</span> {lyrics.styleTags}
                </div>
              )}
              <div className="flex flex-wrap gap-1">
                {lyrics.sections.map((s, i) => (
                  <span key={i} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}
          <details className="rounded border border-border p-2 text-xs">
            <summary className="cursor-pointer text-muted-foreground">
              Send to Suno (your API provider)
            </summary>
            <div className="mt-2 space-y-2">
              <label className={label}>
                API endpoint (POST)
                <input
                  className={inputCls}
                  placeholder="https://your-suno-provider/api/generate"
                  value={sunoUrl}
                  onChange={(e) => setSunoUrl(e.target.value)}
                />
              </label>
              <label className={label}>
                API key (kept for this session only, never saved)
                <input
                  type="password"
                  className={inputCls}
                  value={sunoKey}
                  onChange={(e) => setSunoKey(e.target.value)}
                />
              </label>
              <label className={label}>
                Request body: {"{{title}} {{style}} {{lyrics}}"} are filled in
                <textarea
                  className={cn(inputCls, "min-h-[110px]")}
                  value={sunoBody}
                  onChange={(e) => setSunoBody(e.target.value)}
                />
              </label>
              <Btn
                variant="blue"
                onClick={sendSuno}
                disabled={!!busy || !sunoUrl || !lyrics.lyrics}
                className="flex items-center gap-1"
              >
                <Send className="h-3 w-3" />
                Generate track on Suno
              </Btn>
              {sunoOut && (
                <pre className="max-h-40 overflow-auto rounded bg-background p-2 font-mono text-[10px]">
                  {sunoOut}
                </pre>
              )}
              <label className={label}>
                Downloaded audio file name (used in Stage D)
                <input
                  className={inputCls}
                  value={audioFile}
                  onChange={(e) => setAudioFile(e.target.value)}
                />
              </label>
            </div>
          </details>
        </Stage>

        {/* ── Stage B ── */}
        <Stage
          n="B"
          title="Scene Director · JSON Storyboard"
          icon={<Clapperboard className="h-4 w-4 text-primary" />}
          right={
            scenes.length > 0 && (
              <span className="font-mono text-[10px] text-muted-foreground">
                {scenes.length} scenes
              </span>
            )
          }
        >
          <div className="grid grid-cols-3 gap-2">
            <label className={cn(label, "col-span-2")}>
              Director engine
              <select
                className={inputCls}
                value={dirModel}
                onChange={(e) => setDirModel(e.target.value)}
              >
                {DIRECTOR_ENGINES.map((m) => (
                  <option key={m.tag} value={m.tag}>
                    {m.label}
                    {missing(m.tag) ? " · not installed" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className={label}>
              Cut length (s)
              <input
                type="number"
                min={2}
                max={20}
                className={inputCls}
                value={cut}
                onChange={(e) => setCut(Math.max(2, Number(e.target.value) || 5))}
              />
            </label>
          </div>
          <label className={label}>
            Visual look (kept consistent across scenes)
            <input className={inputCls} value={look} onChange={(e) => setLook(e.target.value)} />
          </label>
          <Btn
            onClick={() => void run("story", () => genStory(lyrics.lyrics || raw))}
            disabled={!!busy || offline || !raw.trim()}
            className="flex w-full items-center justify-center gap-1"
          >
            {busy === "story" ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Clapperboard className="h-3 w-3" />
            )}
            Direct {sceneCount(duration, cut)} scenes
          </Btn>
          {busy === "story" && (
            <pre className="max-h-28 overflow-auto rounded bg-background p-2 font-mono text-[10px] text-muted-foreground">
              {dirRaw || "Thinking…"}
            </pre>
          )}
          {scenes.length > 0 && (
            <>
              <ol className="max-h-[340px] space-y-2 overflow-auto pr-1">
                {scenes.map((s) => (
                  <li key={s.scene_id} className="rounded border border-border bg-card p-2 text-xs">
                    <div className="mb-1 flex justify-between font-mono text-[10px] text-muted-foreground">
                      <span>
                        #{s.scene_id} · {s.shot_type}
                      </span>
                      <span>{s.timestamp}</span>
                    </div>
                    <div>{s.action}</div>
                    <textarea
                      className={cn(inputCls, "mt-1 min-h-[52px] text-[11px]")}
                      value={s.diffusion_prompt}
                      onChange={(e) =>
                        setScenes(
                          scenes.map((x) =>
                            x.scene_id === s.scene_id
                              ? { ...x, diffusion_prompt: e.target.value }
                              : x,
                          ),
                        )
                      }
                    />
                  </li>
                ))}
              </ol>
              <div className="flex flex-wrap gap-2">
                <Btn variant="ghost" onClick={() => copy(JSON.stringify(scenes, null, 2))}>
                  <Copy className="mr-1 inline h-3 w-3" />
                  Copy JSON
                </Btn>
                <Btn
                  variant="ghost"
                  onClick={() =>
                    download("storyboard.json", JSON.stringify(scenes, null, 2), "application/json")
                  }
                >
                  <Download className="mr-1 inline h-3 w-3" />
                  storyboard.json
                </Btn>
              </div>
            </>
          )}
        </Stage>

        {/* ── Stage C ── */}
        <Stage
          n="C"
          title="ComfyUI Batch Payload"
          icon={<Film className="h-4 w-4 text-primary" />}
          right={
            scenes.length > 0 && (
              <span className="font-mono text-[10px] text-muted-foreground">
                {done.length}/{scenes.length} rendered
              </span>
            )
          }
        >
          <label className={label}>
            Video model
            <select
              className={inputCls}
              value={vEngine}
              onChange={(e) => setVEngine(e.target.value as VideoEngine)}
            >
              <option value="ltxv">LTX-Video (fast, 24 fps)</option>
              <option value="wan21">Wan 2.1 T2V 14B fp8 (quality, 16 fps)</option>
              <option value="custom">My own workflow (exported from ComfyUI)</option>
            </select>
          </label>
          {vEngine === "custom" ? (
            <label className={label}>
              Paste ComfyUI Workflow → Export (API). Use{" "}
              {"{{positive}} {{negative}} {{filename}} {{seed}} {{frames}} {{fps}}"} where the
              values go.
              <textarea
                className={cn(inputCls, "min-h-[110px] text-[10px]")}
                value={template}
                onChange={(e) => setTemplate(e.target.value)}
              />
            </label>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              Built-in graph uses ComfyUI core video nodes and default model file names. If ComfyUI
              reports a missing node or file, export your working workflow and choose “My own
              workflow”.
            </p>
          )}
          {scenes.length === 0 ? (
            <p className="text-xs text-muted-foreground">Direct the scenes in Stage B first.</p>
          ) : (
            <>
              <div className="h-2 overflow-hidden rounded bg-muted">
                <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
              </div>
              <ul className="max-h-[220px] space-y-1 overflow-auto text-xs">
                {scenes.map((s) => (
                  <li key={s.scene_id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      aria-label={`Scene ${s.scene_id} rendered`}
                      checked={done.includes(s.scene_id)}
                      onChange={(e) =>
                        setDone(
                          e.target.checked
                            ? [...done, s.scene_id]
                            : done.filter((d) => d !== s.scene_id),
                        )
                      }
                    />
                    <span className="font-mono">scene {s.scene_id}</span>
                    <span className="truncate text-muted-foreground">
                      {s.timestamp} · {s.shot_type}
                    </span>
                    {queued[s.scene_id] && (
                      <span
                        className={cn(
                          "ml-auto font-mono text-[10px]",
                          queued[s.scene_id] === "queued" ? "text-primary" : "text-destructive",
                        )}
                      >
                        {queued[s.scene_id]}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-2">
                <Btn
                  variant="ghost"
                  onClick={() => {
                    const b = batch();
                    if (b)
                      download("workflow_api.json", JSON.stringify(b, null, 2), "application/json");
                  }}
                >
                  <Download className="mr-1 inline h-3 w-3" />
                  workflow_api.json
                </Btn>
                <Btn
                  variant="blue"
                  onClick={() => void run("queue", () => queueAll())}
                  disabled={!!busy || comfy.state !== "online"}
                >
                  {busy === "queue" ? (
                    <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />
                  ) : (
                    <Send className="mr-1 inline h-3 w-3" />
                  )}
                  Queue all in ComfyUI
                </Btn>
              </div>
            </>
          )}
        </Stage>

        {/* ── Stage D ── */}
        <Stage
          n="D"
          title="FFmpeg Stitch Script"
          icon={<Terminal className="h-4 w-4 text-primary" />}
        >
          <div className="grid grid-cols-2 gap-2">
            <label className={label}>
              FFmpeg (name or full path)
              <input
                className={inputCls}
                value={ffmpeg}
                onChange={(e) => setFfmpeg(e.target.value)}
                placeholder="E:\OFFLINE AI\ffmpeg\bin\ffmpeg.exe"
              />
            </label>
            <label className={label}>
              Clips folder (blank = next to the script)
              <input
                className={inputCls}
                value={folder}
                onChange={(e) => setFolder(e.target.value)}
                placeholder="E:\OFFLINE AI\ComfyUI\output"
              />
            </label>
          </div>
          {scenes.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              The script is built from your Stage B scenes.
            </p>
          ) : (
            <>
              <pre className="max-h-[260px] overflow-auto rounded bg-background p-2 font-mono text-[10px] leading-relaxed">
                {script}
              </pre>
              <div className="flex flex-wrap gap-2">
                <Btn onClick={() => copy(script)}>
                  <Copy className="mr-1 inline h-3 w-3" />
                  Copy Batch Script
                </Btn>
                <Btn variant="ghost" onClick={() => download("stitch_music_video.bat", script)}>
                  <Download className="mr-1 inline h-3 w-3" />
                  stitch_music_video.bat
                </Btn>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Save it in the clips folder and double-click. It picks the newest take of each
                scene, joins them without re-encoding, then adds <code>{audioFile}</code> as the
                soundtrack → <code>final_music_video.mp4</code>.
              </p>
            </>
          )}
        </Stage>
      </div>
    </div>
  );
}
