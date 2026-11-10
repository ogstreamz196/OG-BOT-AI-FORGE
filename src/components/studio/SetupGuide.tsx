import {
  Cpu,
  Plug,
  Download,
  ShieldCheck,
  WifiOff,
  Clapperboard,
  Image,
  Brain,
  Copy,
} from "lucide-react";
import { Panel, Btn } from "./ui";
import { BrandMark } from "./BrandMark";
import launchHub from "../../../scripts/launch-hub.bat?raw";
import startOllama from "../../../scripts/start_ollama.bat?raw";
import installAutostart from "../../../scripts/install-autostart.bat?raw";
import uninstallAutostart from "../../../scripts/uninstall-autostart.bat?raw";
import driveWatcher from "../../../scripts/drive-watcher.ps1?raw";
import driveServer from "../../../scripts/og-drive-server.py?raw";
import { useState } from "react";
import { driveLink, useDriveLink } from "@/lib/drive-link";

/** The plug-in-and-go kit: copy these into <drive>:\OFFLINE AI\OG-BOT\ */
export const DRIVE_KIT: { name: string; content: string; what: string }[] = [
  {
    name: "og-drive-server.py",
    content: driveServer,
    what: "The drive's brain: hardware scan, starts the engines, remote access, weekly model refresh.",
  },
  {
    name: "launch-hub.bat",
    content: launchHub,
    what: "Starts Ollama + ComfyUI from the drive and opens the studio.",
  },
  {
    name: "install-autostart.bat",
    content: installAutostart,
    what: "Run once per laptop: OG-BOT then starts whenever the drive is plugged in.",
  },
  {
    name: "drive-watcher.ps1",
    content: driveWatcher,
    what: "The tiny hidden watcher the installer sets up (keep it next to the installer).",
  },
  {
    name: "uninstall-autostart.bat",
    content: uninstallAutostart,
    what: "Turns plug-in autostart off again.",
  },
  {
    name: "start_ollama.bat",
    content: startOllama,
    what: "Starts only Ollama (E:\\OFFLINE AI\\ollama\\bin), keeping models loaded.",
  },
];

function saveFile(name: string, content: string) {
  // Windows scripts need CRLF line endings.
  const url = URL.createObjectURL(
    new Blob([content.replace(/\r?\n/g, "\r\n")], { type: "application/octet-stream" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

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
  {
    title: "Router / dispatcher (fast)",
    pull: "ollama pull llama3.2:3b",
    note: "The master AI that assigns tasks. Tiny + instant.",
  },
  {
    title: "Coding (lead)",
    pull: "ollama pull qwen2.5-coder:14b",
    note: "Drives the web builder. qwen2.5-coder:7b for handheld / low power.",
  },
  {
    title: "Reasoning",
    pull: "ollama pull deepseek-r1:14b",
    note: "Plans hard tasks before the coder builds. phi4:14b for maths/algorithms.",
  },
  {
    title: "Director & lyrics",
    pull: "ollama pull qwen2.5:14b",
    note: "Cinematic writing; dolphin3:8b for unfiltered lyrics.",
  },
  {
    title: "Vision",
    pull: "ollama pull llama3.2-vision:11b",
    note: "Understands images and screenshots.",
  },
  {
    title: "Strict JSON / prompt enhance",
    pull: "ollama pull mistral-nemo:12b",
    note: "Storyboards and structured output; hermes3:8b is the light option.",
  },
];

const IMG_RECS: Rec[] = [
  {
    title: "Flux dev (top quality)",
    pull: "flux1-dev.safetensors → ComfyUI/models/unet",
    note: "Best fidelity + text. Needs the CLIP + VAE below.",
  },
  {
    title: "Flux text encoders",
    pull: "t5xxl_fp16.safetensors + clip_l.safetensors → models/clip",
    note: "Shared by all Flux models.",
  },
  { title: "Flux VAE", pull: "ae.safetensors → ComfyUI/models/vae", note: "Decodes Flux latents." },
  {
    title: "SDXL base (fast, versatile)",
    pull: "sd_xl_base_1.0.safetensors → models/checkpoints",
    note: "Great all-rounder, lighter than Flux.",
  },
  {
    title: "Juggernaut XL (photoreal)",
    pull: "juggernautXL.safetensors → models/checkpoints",
    note: "Popular realistic SDXL finetune.",
  },
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

/** Remote access: pair the drive once so it can tell the studio where it is when online. */
function PairDrive() {
  const d = useDriveLink();
  const [msg, setMsg] = useState<string | null>(null);
  const pair = async () => {
    setMsg("Creating a pairing key…");
    const r = await driveLink.pair();
    if (!r.ok) return setMsg(r.message);
    saveFile(
      "og-drive.json",
      JSON.stringify({ drive_key: r.key, remote: true, auto_update_models: true }, null, 2),
    );
    setMsg(
      "Saved og-drive.json: put it in OFFLINE AI\\OG-BOT\\ next to og-drive-server.py, then replug the drive. Pairing again replaces the old key.",
    );
  };
  return (
    <Panel
      title="Remote access · use the drive from anywhere"
      right={<span className="font-mono text-[10px] text-muted-foreground">{d.message}</span>}
    >
      <ul className="mb-3 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
        <li>
          The AI runs on the drive. This website is only the controls, so it works on any phone or
          computer.
        </li>
        <li>
          When the drive's laptop is online, the drive opens a private Cloudflare tunnel and tells
          the studio its address. Only your D.EV Google accounts can use it.
        </li>
        <li>Plugged into the same computer, it works with no internet at all.</li>
      </ul>
      <Btn onClick={() => void pair()}>Pair this drive (download og-drive.json)</Btn>
      {msg && <p className="mt-2 font-mono text-[11px] text-muted-foreground">{msg}</p>}
    </Panel>
  );
}

export function SetupGuide() {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4 rounded-2xl border border-border bg-panel/80 p-3">
        <img
          src="/og-streamz-brand.webp"
          alt="OGSTREAMZ presentz"
          className="h-20 w-20 rounded-xl object-cover sm:h-24 sm:w-24"
        />
        <BrandMark size="lg" />
      </div>
      <Panel title="Setup Guide">
        <p className="mb-3 text-xs text-muted-foreground">
          OGSTREAMZ presentz OFFLINE FORGE, powered by OG BOT, is your offline gateway to local AI:
          chat-build apps, and create images, songs and videos — all on your own GPU. A copy of
          these steps lives in <span className="font-mono text-foreground">SETUP-DRIVE.md</span> in
          the project.
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

      <PairDrive />

      <Panel
        title="Drive kit · plug in and go"
        right={<Download className="h-4 w-4 text-primary" />}
      >
        <ol className="mb-3 list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
          <li>
            Install this app (step 4) and open it once online, so it works offline afterwards.
          </li>
          <li>
            Download all files below into{" "}
            <span className="font-mono text-foreground">E:\OFFLINE AI\OG-BOT\</span> on your drive.
          </li>
          <li>
            Double-click <span className="font-mono text-foreground">install-autostart.bat</span>{" "}
            once on each laptop.
          </li>
          <li>
            From then on, plugging the drive in starts Ollama, ComfyUI and the studio by itself
            (about 5 seconds).
          </li>
        </ol>
        <ul className="space-y-2">
          {DRIVE_KIT.map((f) => (
            <li
              key={f.name}
              className="flex flex-wrap items-center gap-2 rounded border border-border bg-card px-3 py-2 text-xs"
            >
              <span className="font-mono text-foreground">{f.name}</span>
              <span className="flex-1 text-muted-foreground">{f.what}</span>
              <Btn variant="ghost" onClick={() => saveFile(f.name, f.content)}>
                Download
              </Btn>
            </li>
          ))}
        </ul>
        <div className="mt-2">
          <Btn
            onClick={() =>
              DRIVE_KIT.forEach((f, i) => setTimeout(() => saveFile(f.name, f.content), i * 400))
            }
          >
            Download all {DRIVE_KIT.length}
          </Btn>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Windows blocks USB drives from launching programs by themselves (AutoRun), so a small
          watcher on the laptop does it instead. No admin rights needed.
        </p>
      </Panel>

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="Recommended models" right={<Brain className="h-4 w-4 text-primary" />}>
          <p className="mb-2 text-xs text-muted-foreground">
            Language models for the builder + AI routing. Pull what your VRAM allows — the router
            auto-picks the best installed one for each task.
          </p>
          <RecList recs={LLM_RECS} />
        </Panel>

        <Panel title="Image models (ComfyUI)" right={<Image className="h-4 w-4 text-primary" />}>
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
