import { useCallback, useEffect, useRef, useState } from "react";
import {
  Sparkles,
  Wand2,
  Dice5,
  Download,
  Copy,
  RefreshCw,
  Loader2,
  ImageOff,
  Settings2,
} from "lucide-react";
import { Panel, Btn, Bar, inputCls } from "./ui";
import { cn } from "@/lib/utils";
import { usage } from "@/lib/usage";
import { connectors } from "@/lib/connectors";
import { models } from "@/lib/models";
import { quickChat } from "@/lib/local-ai";
import {
  STYLE_PRESETS,
  ASPECTS,
  SAMPLERS,
  SCHEDULERS,
  styleById,
  aspectById,
  randomSeed,
  txt2imgWorkflow,
  viewUrl,
  queueComfy,
  pingComfy,
  waitForImages,
  fetchCheckpoints,
  enhanceInstruction,
  cleanEnhanced,
  type GenOpts,
} from "@/lib/image-gen";

type Shot = { url: string; prompt: string; seed: number; opts: GenOpts };

export function ImageGen() {
  const [prompt, setPrompt] = useState("a lone astronaut watching two moons rise over a desert");
  const [styleId, setStyleId] = useState("cinematic");
  const [aspectId, setAspectId] = useState("16:9");
  const [checkpoint, setCheckpoint] = useState("");
  const [checkpoints, setCheckpoints] = useState<string[]>([]);
  const [steps, setSteps] = useState(32);
  const [cfg, setCfg] = useState(6.5);
  const [sampler, setSampler] = useState("dpmpp_2m");
  const [scheduler, setScheduler] = useState("karras");
  const [seed, setSeed] = useState(() => randomSeed());
  const [lockSeed, setLockSeed] = useState(false);
  const [batch, setBatch] = useState(1);
  const [negative, setNegative] = useState("");
  const [advanced, setAdvanced] = useState(false);

  const [comfyOk, setComfyOk] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [status, setStatus] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [enhancing, setEnhancing] = useState(false);
  const [shots, setShots] = useState<Shot[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const comfyUrl = connectors.configOf("comfyui")["baseUrl"] ?? "http://127.0.0.1:8188";
  const ollamaUrl = connectors.isEnabled("ollama") ? connectors.configOf("ollama")["baseUrl"] : null;

  const connect = useCallback(async () => {
    const ok = await pingComfy(comfyUrl);
    setComfyOk(ok);
    if (ok) {
      const list = await fetchCheckpoints(comfyUrl);
      setCheckpoints(list);
      setCheckpoint((c) => c || list[0] || "");
    }
  }, [comfyUrl]);

  useEffect(() => {
    void connect();
  }, [connect]);

  // Picking a style loads its tuned cfg/steps defaults.
  const applyStyle = (id: string) => {
    setStyleId(id);
    const s = styleById(id);
    setSteps(s.steps);
    setCfg(s.cfg);
  };

  const enhance = async () => {
    if (!ollamaUrl) {
      setErr("Enable Ollama (Connectors) so the AI can enrich your prompt.");
      return;
    }
    setEnhancing(true);
    setErr(null);
    try {
      const model = models.activeTag() ?? "llama3.2:3b";
      const text = await quickChat(ollamaUrl, model, enhanceInstruction(prompt, styleId));
      const cleaned = cleanEnhanced(text);
      if (cleaned) setPrompt(cleaned);
    } catch (e) {
      setErr(`Could not enhance (${e instanceof Error ? e.message : "error"}).`);
    } finally {
      setEnhancing(false);
    }
  };

  const buildOpts = (useSeed: number): GenOpts => {
    const a = aspectById(aspectId);
    return {
      prompt,
      styleId,
      negative,
      checkpoint,
      width: a.width,
      height: a.height,
      steps,
      cfg,
      sampler,
      scheduler,
      seed: useSeed,
      batch,
    };
  };

  const generate = async (opts: GenOpts) => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    setStatus("Queuing…");
    setElapsed(0);
    const ac = new AbortController();
    abortRef.current = ac;
    const t0 = Date.now();
    const timer = setInterval(() => setElapsed((Date.now() - t0) / 1000), 200);
    try {
      const graph = txt2imgWorkflow(opts);
      const q = await queueComfy(comfyUrl, graph);
      if (!q.ok || !q.promptId) throw new Error(q.message || "ComfyUI did not accept the job");
      setStatus("Rendering on your GPU…");
      const images = await waitForImages(comfyUrl, q.promptId, { signal: ac.signal });
      if (images.length === 0) throw new Error("Timed out waiting for the render");
      const newShots: Shot[] = images.map((img) => ({
        url: viewUrl(comfyUrl, img),
        prompt: opts.prompt,
        seed: opts.seed,
        opts,
      }));
      setShots((s) => [...newShots, ...s]);
      usage.record("images");
      setStatus(null);
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError"))
        setErr(e instanceof Error ? e.message : "Generation failed");
      setStatus(null);
    } finally {
      clearInterval(timer);
      setBusy(false);
      abortRef.current = null;
    }
  };

  const run = () => {
    const useSeed = lockSeed ? seed : randomSeed();
    if (!lockSeed) setSeed(useSeed);
    void generate(buildOpts(useSeed));
  };

  const vary = (shot: Shot) => {
    const s = randomSeed();
    setSeed(s);
    void generate({ ...shot.opts, seed: s, batch: 1 });
  };

  const reuseSeed = (shot: Shot) => {
    setSeed(shot.seed);
    setLockSeed(true);
  };

  const copyWorkflow = async () => {
    const graph = txt2imgWorkflow(buildOpts(seed));
    try {
      await navigator.clipboard.writeText(JSON.stringify(graph, null, 2));
      setStatus("Workflow JSON copied — paste into ComfyUI (Load).");
      setTimeout(() => setStatus(null), 3000);
    } catch {
      setErr("Clipboard unavailable.");
    }
  };

  return (
    <div className="grid gap-3 lg:grid-cols-[340px_1fr]">
      <Panel
        title="Image Studio"
        right={
          <span
            className={cn(
              "font-mono text-[10px]",
              comfyOk ? "text-primary" : comfyOk === false ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {comfyOk ? "ComfyUI ready" : comfyOk === false ? "offline" : "checking…"}
          </span>
        }
      >
        <div className="space-y-3">
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-xs text-muted-foreground">Prompt</label>
              <button
                onClick={() => void enhance()}
                disabled={enhancing || !prompt.trim()}
                className="flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] text-primary transition hover:border-primary disabled:opacity-40"
              >
                {enhancing ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Wand2 className="h-3 w-3" />
                )}
                Enhance with AI
              </button>
            </div>
            <textarea
              rows={3}
              className={cn(inputCls, "resize-y leading-relaxed")}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe the image…"
            />
          </div>

          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-widest text-muted-foreground">
              Style
            </label>
            <div className="flex flex-wrap gap-1.5">
              {STYLE_PRESETS.map((s) => (
                <button
                  key={s.id}
                  onClick={() => applyStyle(s.id)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[11px] transition",
                    styleId === s.id
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-border bg-card text-muted-foreground hover:border-primary",
                  )}
                >
                  {s.name}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-widest text-muted-foreground">
              Aspect ratio
            </label>
            <div className="flex flex-wrap gap-1.5">
              {ASPECTS.map((a) => (
                <button
                  key={a.id}
                  onClick={() => setAspectId(a.id)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 font-mono text-[11px] transition",
                    aspectId === a.id
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-border bg-card text-muted-foreground hover:border-primary",
                  )}
                >
                  {a.id}
                </button>
              ))}
            </div>
          </div>

          {checkpoints.length > 0 && (
            <label className="block text-xs text-muted-foreground">
              Model checkpoint
              <select
                className={cn(inputCls, "mt-1")}
                value={checkpoint}
                onChange={(e) => setCheckpoint(e.target.value)}
              >
                {checkpoints.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          )}

          <div className="flex items-center gap-2">
            <label className="flex flex-1 items-center gap-2 text-xs text-muted-foreground">
              Batch
              <input
                type="number"
                min={1}
                max={8}
                value={batch}
                onChange={(e) => setBatch(Math.max(1, Math.min(8, +e.target.value || 1)))}
                className={cn(inputCls, "w-16")}
              />
            </label>
            <button
              onClick={() => setAdvanced((a) => !a)}
              className="flex items-center gap-1 rounded border border-border px-2 py-1.5 text-[11px] text-muted-foreground hover:border-primary hover:text-primary"
            >
              <Settings2 className="h-3 w-3" />
              Advanced
            </button>
          </div>

          {advanced && (
            <div className="space-y-2 rounded-lg border border-border bg-card/50 p-2">
              <label className="block text-xs text-muted-foreground">
                Steps: {steps}
                <input
                  type="range"
                  min={10}
                  max={60}
                  value={steps}
                  onChange={(e) => setSteps(+e.target.value)}
                  className="w-full accent-primary"
                />
              </label>
              <label className="block text-xs text-muted-foreground">
                CFG (prompt strength): {cfg}
                <input
                  type="range"
                  min={1}
                  max={15}
                  step={0.5}
                  value={cfg}
                  onChange={(e) => setCfg(+e.target.value)}
                  className="w-full accent-primary"
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-xs text-muted-foreground">
                  Sampler
                  <select
                    className={cn(inputCls, "mt-1")}
                    value={sampler}
                    onChange={(e) => setSampler(e.target.value)}
                  >
                    {SAMPLERS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs text-muted-foreground">
                  Scheduler
                  <select
                    className={cn(inputCls, "mt-1")}
                    value={scheduler}
                    onChange={(e) => setScheduler(e.target.value)}
                  >
                    {SCHEDULERS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="block text-xs text-muted-foreground">
                Negative prompt (extra)
                <input
                  className={cn(inputCls, "mt-1")}
                  value={negative}
                  onChange={(e) => setNegative(e.target.value)}
                  placeholder="things to avoid…"
                />
              </label>
              <div className="flex items-center gap-2">
                <label className="flex flex-1 items-center gap-1 text-xs text-muted-foreground">
                  Seed
                  <input
                    type="number"
                    value={seed}
                    onChange={(e) => setSeed(+e.target.value || 0)}
                    className={cn(inputCls, "flex-1")}
                  />
                </label>
                <button
                  onClick={() => setSeed(randomSeed())}
                  title="Randomize"
                  className="rounded border border-border p-2 text-muted-foreground hover:border-primary hover:text-primary"
                >
                  <Dice5 className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => setLockSeed((l) => !l)}
                  className={cn(
                    "rounded border px-2 py-1.5 text-[11px]",
                    lockSeed
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-border text-muted-foreground",
                  )}
                >
                  {lockSeed ? "Locked" : "Lock"}
                </button>
              </div>
            </div>
          )}

          {comfyOk ? (
            busy ? (
              <div className="space-y-2">
                <Bar value={Math.min(95, elapsed * 8)} />
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {status} {elapsed.toFixed(1)}s
                  </span>
                  <Btn variant="ghost" onClick={() => abortRef.current?.abort()}>
                    Stop
                  </Btn>
                </div>
              </div>
            ) : (
              <Btn onClick={run} className="w-full">
                <Sparkles className="mr-1 inline h-4 w-4" />
                Generate {batch > 1 ? `${batch} images` : "image"}
              </Btn>
            )
          ) : (
            <div className="space-y-2 rounded-lg border border-border bg-card p-3 text-xs text-muted-foreground">
              <p>
                ComfyUI isn't reachable at <span className="font-mono">{comfyUrl}</span>. Start it
                with <span className="font-mono">--enable-cors-header</span>, or copy the workflow
                and run it in ComfyUI directly.
              </p>
              <div className="flex gap-2">
                <Btn variant="ghost" onClick={() => void connect()}>
                  <RefreshCw className="mr-1 inline h-3 w-3" /> Retry
                </Btn>
                <Btn variant="ghost" onClick={() => void copyWorkflow()}>
                  <Copy className="mr-1 inline h-3 w-3" /> Copy workflow
                </Btn>
              </div>
            </div>
          )}
          {status && !busy && (
            <div className="font-mono text-[11px] text-primary">{status}</div>
          )}
          {err && <div className="font-mono text-[11px] text-destructive">{err}</div>}
        </div>
      </Panel>

      <Panel
        title="Gallery"
        right={
          shots.length > 0 && (
            <span className="font-mono text-[10px] text-muted-foreground">{shots.length}</span>
          )
        }
      >
        {shots.length === 0 ? (
          <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
            <ImageOff className="h-8 w-8 opacity-40" />
            <p>Your generated images appear here.</p>
            <p className="text-xs">
              Pick a style, write a prompt (or hit{" "}
              <span className="text-primary">Enhance with AI</span>), then Generate.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {shots.map((shot, i) => (
              <figure
                key={`${shot.seed}-${i}`}
                className="group relative overflow-hidden rounded-xl border border-border bg-card"
              >
                <img
                  src={shot.url}
                  alt={shot.prompt}
                  loading="lazy"
                  className="aspect-square w-full object-cover"
                />
                <figcaption className="absolute inset-x-0 bottom-0 flex flex-col gap-1 bg-gradient-to-t from-black/85 to-transparent p-2 opacity-0 transition group-hover:opacity-100">
                  <p className="line-clamp-2 text-[10px] text-white/90">{shot.prompt}</p>
                  <div className="flex items-center gap-1">
                    <a
                      href={shot.url}
                      target="_blank"
                      rel="noreferrer"
                      download
                      title="Download"
                      className="rounded bg-white/15 p-1.5 text-white hover:bg-white/30"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </a>
                    <button
                      onClick={() => vary(shot)}
                      title="Make a variation"
                      className="rounded bg-white/15 p-1.5 text-white hover:bg-white/30"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => reuseSeed(shot)}
                      title="Reuse this seed"
                      className="rounded bg-white/15 p-1.5 text-white hover:bg-white/30"
                    >
                      <Dice5 className="h-3.5 w-3.5" />
                    </button>
                    <span className="ml-auto font-mono text-[9px] text-white/60">#{shot.seed}</span>
                  </div>
                </figcaption>
              </figure>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
