import { useEffect, useRef, useState } from "react";
import { Clapperboard, Music2, Film, Wand2, Copy, Download, Loader2 } from "lucide-react";
import { Panel, Btn, inputCls } from "./ui";
import { cn } from "@/lib/utils";
import { connectors } from "@/lib/connectors";
import { pingOllama } from "@/lib/local-ai";
import { models as modelStore } from "@/lib/models";
import {
  callDirector,
  comfyWorkflow,
  concatScript,
  pickDirectorModel,
  pingComfy,
  queueComfy,
  scenePromptsText,
  workflowBundle,
  type DirectorOutput,
  type Scene,
  type TrackConcept,
} from "@/lib/music-video";

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

function Badge({ label, ok, text }: { label: string; ok: boolean | null; text: string }) {
  const color = ok === null ? "#eab308" : ok ? "#22c55e" : "#ef4444";
  return (
    <span className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[11px] font-mono">
      <span
        className="h-2 w-2 rounded-full"
        style={{ background: color, boxShadow: `0 0 8px ${color}` }}
      />
      {label}: <span className="text-muted-foreground">{text}</span>
    </span>
  );
}

export function MusicVideo({ initialPrompt }: { initialPrompt?: string } = {}) {
  const [concept, setConcept] = useState<TrackConcept>({
    genre: "synthwave",
    theme: initialPrompt?.trim() || "neon night drive",
    bpm: 110,
    durationSec: 90,
  });
  const [models, setModels] = useState<string[]>([]);
  const [director, setDirector] = useState("mistral-nemo:12b");
  const [ollamaOk, setOllamaOk] = useState<boolean | null>(null);
  const [comfyOk, setComfyOk] = useState<boolean | null>(null);
  const [out, setOut] = useState<DirectorOutput | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState("");
  const [active, setActive] = useState<number | null>(null);
  const [queueMsg, setQueueMsg] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const ollamaUrl = connectors.isEnabled("ollama")
    ? (connectors.configOf("ollama")["baseUrl"] ?? "http://127.0.0.1:11434")
    : "http://127.0.0.1:11434";
  const comfyUrl = connectors.configOf("comfyui")["baseUrl"] ?? "http://127.0.0.1:8188";
  const sunoEndpoint = connectors.configOf("suno")["endpoint"] ?? "";

  useEffect(() => {
    let live = true;
    void pingOllama(ollamaUrl).then((r) => {
      if (!live) return;
      setOllamaOk(r.ok);
      if (r.models.length) {
        setModels(r.models);
        setDirector(pickDirectorModel(r.models));
        modelStore.syncLive(r.models); // share the live list app-wide
      }
    });
    void pingComfy(comfyUrl).then((ok) => live && setComfyOk(ok));
    return () => {
      live = false;
    };
  }, [ollamaUrl, comfyUrl]);

  const direct = async () => {
    setBusy(true);
    setErr(null);
    setOut(null);
    try {
      setOut(await callDirector(ollamaUrl, director, concept));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Director failed. Is Ollama running?");
    } finally {
      setBusy(false);
    }
  };

  const queueAll = async () => {
    if (!out) return;
    setQueueMsg("Queuing scenes in ComfyUI…");
    let ok = 0;
    for (const s of out.storyboard) {
      const r = await queueComfy(comfyUrl, comfyWorkflow(s));
      if (r.ok) ok += 1;
    }
    setQueueMsg(`Queued ${ok}/${out.storyboard.length} scenes to ComfyUI (${comfyUrl}).`);
  };

  // Sync the active scene to audio playback.
  const onTime = () => {
    const t = audioRef.current?.currentTime ?? 0;
    const s = out?.storyboard.find((x) => t >= x.start_sec && t < x.end_sec);
    setActive(s ? s.scene_id : null);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge label="Ollama" ok={ollamaOk} text={ollamaOk ? "127.0.0.1:11434" : "offline"} />
        <Badge
          label="Suno"
          ok={sunoEndpoint ? true : null}
          text={sunoEndpoint ? "configured" : "manual"}
        />
        <Badge
          label="ComfyUI"
          ok={comfyOk}
          text={comfyOk ? "127.0.0.1:8188" : "staged / preview"}
        />
      </div>

      {/* Step 1 — Director */}
      <Panel
        title="1 · Director (Ollama)"
        right={
          <select
            aria-label="Director model"
            value={director}
            onChange={(e) => setDirector(e.target.value)}
            className={cn(inputCls, "max-w-[200px]")}
          >
            {(models.length ? models : [director]).map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        }
      >
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-xs text-muted-foreground">
            Genre
            <input
              className={inputCls}
              value={concept.genre}
              onChange={(e) => setConcept({ ...concept, genre: e.target.value })}
            />
          </label>
          <label className="text-xs text-muted-foreground">
            Theme
            <input
              className={inputCls}
              value={concept.theme}
              onChange={(e) => setConcept({ ...concept, theme: e.target.value })}
            />
          </label>
          <label className="text-xs text-muted-foreground">
            BPM
            <input
              type="number"
              className={inputCls}
              value={concept.bpm}
              onChange={(e) => setConcept({ ...concept, bpm: +e.target.value })}
            />
          </label>
          <label className="text-xs text-muted-foreground">
            Duration (sec)
            <input
              type="number"
              className={inputCls}
              value={concept.durationSec}
              onChange={(e) => setConcept({ ...concept, durationSec: +e.target.value })}
            />
          </label>
        </div>
        <Btn onClick={() => void direct()} disabled={busy} className="mt-3 w-full">
          {busy ? (
            <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />
          ) : (
            <Wand2 className="mr-1 inline h-3 w-3" />
          )}
          {busy ? "Directing…" : "Direct the track & storyboard"}
        </Btn>
        {err && <p className="mt-2 text-xs text-destructive">{err}</p>}
      </Panel>

      {out && (
        <>
          {/* Step 2 — Suno audio */}
          <Panel title="2 · Audio (Suno)">
            <div className="grid gap-3 lg:grid-cols-2">
              <div>
                <div className="mb-1 flex items-center justify-between text-[11px] uppercase tracking-widest text-muted-foreground">
                  Style prompt
                  <button
                    onClick={() =>
                      void navigator.clipboard?.writeText(out.suno_config.style_prompt)
                    }
                    className="text-primary hover:underline"
                  >
                    <Copy className="mr-1 inline h-3 w-3" />
                    Copy
                  </button>
                </div>
                <pre className="max-h-24 overflow-auto rounded border border-border bg-background p-2 text-xs text-foreground">
                  {out.suno_config.style_prompt}
                </pre>
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between text-[11px] uppercase tracking-widest text-muted-foreground">
                  Lyrics
                  <button
                    onClick={() => void navigator.clipboard?.writeText(out.suno_config.lyrics)}
                    className="text-primary hover:underline"
                  >
                    <Copy className="mr-1 inline h-3 w-3" />
                    Copy
                  </button>
                </div>
                <pre className="max-h-24 overflow-auto whitespace-pre-wrap rounded border border-border bg-background p-2 text-xs text-foreground">
                  {out.suno_config.lyrics}
                </pre>
              </div>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              <Music2 className="mr-1 inline h-3 w-3" />
              Generate in Suno
              {sunoEndpoint
                ? ` (endpoint: ${sunoEndpoint})`
                : " (paste the style + lyrics into Suno)"}
              , then paste the audio URL below to sync it to the storyboard.
            </p>
            <div className="mt-2 flex gap-2">
              <input
                className={inputCls}
                placeholder="https://…/track.mp3"
                value={audioUrl}
                onChange={(e) => setAudioUrl(e.target.value)}
              />
            </div>
            {audioUrl && (
              <audio
                ref={audioRef}
                src={audioUrl}
                controls
                onTimeUpdate={onTime}
                className="mt-2 w-full"
              >
                <track kind="captions" />
              </audio>
            )}
          </Panel>

          {/* Step 3 — Storyboard / Video */}
          <Panel
            title="3 · Storyboard & Render"
            right={
              comfyOk ? (
                <Btn onClick={() => void queueAll()}>
                  <Film className="mr-1 inline h-3 w-3" />
                  Queue all in ComfyUI
                </Btn>
              ) : (
                <span className="font-mono text-[11px] text-muted-foreground">preview mode</span>
              )
            }
          >
            {queueMsg && <p className="mb-2 text-xs text-primary">{queueMsg}</p>}
            <div className="mb-3 flex flex-wrap gap-2">
              <Btn
                variant="ghost"
                onClick={() => download("scene-prompts.txt", scenePromptsText(out))}
              >
                <Download className="mr-1 inline h-3 w-3" />
                Scene prompts
              </Btn>
              <Btn
                variant="ghost"
                onClick={() =>
                  download("comfyui-workflows.json", workflowBundle(out), "application/json")
                }
              >
                <Download className="mr-1 inline h-3 w-3" />
                Workflow JSON
              </Btn>
              <Btn variant="ghost" onClick={() => download("concat.txt", concatScript(out))}>
                <Download className="mr-1 inline h-3 w-3" />
                FFmpeg concat.txt
              </Btn>
            </div>
            <ol className="space-y-2">
              {out.storyboard.map((s: Scene) => (
                <li
                  key={s.scene_id}
                  className={cn(
                    "rounded-xl border bg-card p-3 transition",
                    active === s.scene_id
                      ? "border-primary shadow-[0_0_0_1px_var(--og-primary,#3d5afe)]"
                      : "border-border",
                  )}
                >
                  <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                    <span className="font-mono text-muted-foreground">
                      #{s.scene_id} · {s.start_sec}–{s.end_sec}s
                    </span>
                    <span className="rounded-full bg-secondary/20 px-2 py-0.5 font-mono text-[10px] uppercase text-secondary">
                      {s.camera_motion}
                    </span>
                  </div>
                  <div className="text-sm text-foreground">{s.visual_prompt}</div>
                  {s.lyric_cue && (
                    <div className="mt-1 text-[11px] italic text-muted-foreground">
                      ♪ {s.lyric_cue}
                    </div>
                  )}
                </li>
              ))}
            </ol>
          </Panel>
        </>
      )}

      {!out && !busy && (
        <p className="px-1 text-xs text-muted-foreground">
          <Clapperboard className="mr-1 inline h-3 w-3" />
          Set a concept and press Direct. Works offline with your local models; ComfyUI renders when
          connected, otherwise you get the full storyboard, exportable prompts, ComfyUI workflow
          JSON and an FFmpeg concat script.
        </p>
      )}
    </div>
  );
}
