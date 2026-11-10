import { Cpu, Plug, Download, ShieldCheck, WifiOff, Clapperboard, Image, Brain, Copy } from "lucide-react";
import { Panel } from "./ui";

/**
 * Static, self-contained onboarding panel: how to run OG-BOT offline from the
 * drive and connect the local AI. No state, no deps — safe to render anywhere.
 */
const STEPS: { icon: typeof Cpu; title: string; body: string }[] = [
  {
    icon: Cpu,
    title: "1 · Start your local AI",
    body: "Run start_ollama.bat (or `ollama serve` with OLLAMA_ORIGINS=https://offline.ogbot.co.uk,https://*.lovable.app). Ollama serves at http://127.0.0.1:11434 with models on your drive.",
  },
  {
    icon: Plug,
    title: "2 · Connect it",
    body: "Tools → Connectors → Ollama → set http://127.0.0.1:11434 → Test connection. Then Settings → mark a coding model installed → set active.",
  },
  {
    icon: WifiOff,
    title: "3 · Go offline",
    body: "Everything AI runs on your GPU with no internet. Cloud sync (Supabase) and cloud builds pause offline and resume when you reconnect.",
  },
  {
    icon: Download,
    title: "4 · Install as an app",
    body: "Use the Install button (or your browser's Install app). It caches itself so it opens like an app, even offline.",
  },
  {
    icon: ShieldCheck,
    title: "5 · DEV mode",
    body: "Tap the logo 5× (or Ctrl/Cmd+Shift+D). Sign in with an allow-listed Google account, or use the local code. Use Customer view to preview the end-user UI.",
  },
  {
    icon: Clapperboard,
    title: "6 · Make a music video",
    body: "Tools → Music Video Studio: a local model directs the track + storyboard; add Suno audio and ComfyUI renders (or export prompts / FFmpeg script in staged mode).",
  },
];

type Rec = { title: string; pull: string; note: string };

const LLM_RECS: Rec[] = [
  { title: "Router / dispatcher (fast)", pull: "ollama pull llama3.2:3b", note: "The master AI that assigns tasks. Tiny + instant." },
  { title: "Coding (lead)", pull: "ollama pull qwen2.5-coder:14b", note: "Drives the web builder. qwen2.5-coder:7b for handheld / low power." },
  { title: "Reasoning", pull: "ollama pull deepseek-r1:14b", note: "Plans hard tasks before the coder builds. phi4:14b for maths/algorithms." },
  { title: "Director & lyrics", pull: "ollama pull qwen2.5:14b", note: "Cinematic writing; dolphin3:8b for unfiltered lyrics." },
  { title: "Vision", pull: "ollama pull llama3.2-vision:11b", note: "Understands images and screenshots." },
  { title: "Strict JSON / prompt enhance", pull: "ollama pull mistral-nemo:12b", note: "Storyboards and structured output; hermes3:8b is the light option." },
];

const IMG_RECS: Rec[] = [
  { title: "Flux dev (top quality)", pull: "flux1-dev.safetensors → ComfyUI/models/unet", note: "Best fidelity + text. Needs the CLIP + VAE below." },
  { title: "Flux text encoders", pull: "t5xxl_fp16.safetensors + clip_l.safetensors → models/clip", note: "Shared by all Flux models." },
  { title: "Flux VAE", pull: "ae.safetensors → ComfyUI/models/vae", note: "Decodes Flux latents." },
  { title: "SDXL base (fast, versatile)", pull: "sd_xl_base_1.0.safetensors → models/checkpoints", note: "Great all-rounder, lighter than Flux." },
  { title: "Juggernaut XL (photoreal)", pull: "juggernautXL.safetensors → models/checkpoints", note: "Popular realistic SDXL finetune." },
];

function RecList({ recs }: { recs: Rec[] }) {
  return (
    <ul className="space-y-2">
      {recs.map((r) => (
        <li key={r.title} className="rounded-lg border border-border bg-card p-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-foreground">{r.title}</span>
            <button
              onClick={() => void navigator.clipboard?.writeText(r.pull).catch(() => {})}
              title="Copy"
              className="shrink-0 rounded p-1 text-muted-foreground hover:text-primary"
            >
              <Copy className="h-3 w-3" />
            </button>
          </div>
          <code className="mt-1 block break-all font-mono text-[11px] text-primary">{r.pull}</code>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{r.note}</p>
        </li>
      ))}
    </ul>
  );
}

export function SetupGuide() {
  return (
    <div className="space-y-3">
      <Panel title="Setup Guide">
        <p className="mb-3 text-xs text-muted-foreground">
          OG-BOT is your offline gateway to local AI: chat-build apps, and create images, songs and
          videos — all on your own GPU. A copy of these steps lives in{" "}
          <span className="font-mono text-foreground">SETUP-DRIVE.md</span> in the project.
        </p>
        <ul className="grid gap-2 md:grid-cols-2">
          {STEPS.map(({ icon: Icon, title, body }) => (
            <li key={title} className="rounded-xl border border-border bg-card p-3">
              <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-foreground">
                <Icon className="h-4 w-4 text-primary" />
                {title}
              </div>
              <p className="text-xs text-muted-foreground">{body}</p>
            </li>
          ))}
        </ul>
      </Panel>

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel
          title="Recommended models"
          right={<Brain className="h-4 w-4 text-primary" />}
        >
          <p className="mb-2 text-xs text-muted-foreground">
            Language models for the builder + AI routing. Pull what your VRAM allows — the router
            auto-picks the best installed one for each task.
          </p>
          <RecList recs={LLM_RECS} />
        </Panel>

        <Panel
          title="Image models (ComfyUI)"
          right={<Image className="h-4 w-4 text-primary" />}
        >
          <p className="mb-2 text-xs text-muted-foreground">
            Drop these into your ComfyUI <span className="font-mono">models/</span> folders. Image
            Studio auto-detects them. Flux gives the highest quality; SDXL is faster.
          </p>
          <RecList recs={IMG_RECS} />
        </Panel>
      </div>
    </div>
  );
}
