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
import selfRepair from "../../../scripts/og_self_repair.py?raw";
import { useEffect, useState, type ReactNode } from "react";
import { CheckCircle2, ChevronDown, Circle, Loader2 } from "lucide-react";
import { useEngineStatus } from "@/lib/engine-status";
import { useModels } from "@/lib/models";
import { sameTag } from "@/lib/model-manager";
import { cn } from "@/lib/utils";
import { driveLink, useDriveLink } from "@/lib/drive-link";
import { devAuth } from "@/lib/dev-auth";

/** The plug-in-and-go kit: copy these into <drive>:\OFFLINE AI\OG-BOT\ */
export const DRIVE_KIT: { name: string; content: string; what: string }[] = [
  {
    name: "og_self_repair.py",
    content: selfRepair,
    what: "OG BOT's self-repair: fixes errors in this app with your own coding model, checks and publishes them.",
  },
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
    what: "Starts only Ollama (<drive>:\\OFFLINE AI\\ollama\\bin, any drive letter), keeping models loaded.",
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
    title: "1 · Plug in the drive",
    body: "With the drive kit below in <drive>:\\OFFLINE AI\\OG-BOT\\ and autostart on, plugging in the drive starts Ollama (and ComfyUI when docked) by itself. No autostart? Double-click launch-hub.bat.",
  },
  {
    icon: Plug,
    title: "2 · It connects itself",
    body: "The site finds the drive on its own: plugged in here, or remotely once paired below. The engine badge turns green. Check with Tools → Engine Test; qwen2.5-coder:14b is the default coder.",
  },
  {
    icon: WifiOff,
    title: "3 · Go offline",
    body: "Everything AI runs on your GPU with no internet. Cloud sync and cloud builds pause offline and resume when you reconnect.",
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
  const [needsGoogle, setNeedsGoogle] = useState(false);
  const [ghToken, setGhToken] = useState("");
  const pair = async () => {
    setMsg("Creating a pairing key…");
    const r = await driveLink.pair();
    setNeedsGoogle(!r.ok && !!r.needsGoogle);
    if (!r.ok) return setMsg(r.message);
    saveFile(
      "og-drive.json",
      JSON.stringify(
        {
          drive_key: r.key,
          remote: true,
          auto_update_models: true,
          // Self-repair: lets OG BOT push its checked fixes to the app's repo.
          ...(ghToken.trim()
            ? { github_token: ghToken.trim(), repo: "ogstreamz196/OG-BOT-AI-FORGE" }
            : {}),
        },
        null,
        2,
      ),
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
      <label className="mb-2 block text-[11px] text-muted-foreground">
        Self-repair key (optional): a GitHub fine-grained token for{" "}
        <span className="font-mono">ogstreamz196/OG-BOT-AI-FORGE</span> with Contents: read and
        write. It goes only into og-drive.json on your drive (never stored here), so OG BOT can
        publish its own fixes. Anyone holding the drive could use it, so keep the drive safe.
        <input
          type="password"
          autoComplete="off"
          className="mt-1 w-full rounded border border-input bg-background px-2 py-1.5 font-mono text-xs"
          placeholder="github_pat_…"
          value={ghToken}
          onChange={(e) => setGhToken(e.target.value)}
        />
      </label>
      <Btn onClick={() => void pair()}>Pair this drive (download og-drive.json)</Btn>
      {needsGoogle && (
        <Btn
          variant="blue"
          className="ml-2"
          onClick={() => void devAuth.signIn().then((r) => setMsg(r.message))}
        >
          Sign in with Google
        </Btn>
      )}
      {msg && <p className="mt-2 font-mono text-[11px] text-muted-foreground">{msg}</p>}
    </Panel>
  );
}

/** Newest drive kit version this site ships (og-drive-server.py VERSION). */
export const KIT_VERSION = (driveServer.match(/VERSION\s*=\s*"([\d.]+)"/) ?? [])[1] ?? "0";
const older = (a: string, b: string) => {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d < 0;
  }
  return false;
};

type Check = { id: string; label: string; ok: boolean | null; fix: string; optional?: boolean };

/** Ticks itself from the drive's live status, so you can see what's left to set up. */
export function SetupChecklist() {
  const drive = useDriveLink();
  const engine = useEngineStatus();
  const m = useModels();
  const [installed, setInstalled] = useState(false);
  useEffect(() => {
    try {
      setInstalled(window.matchMedia("(display-mode: standalone)").matches);
    } catch {
      /* old browser */
    }
  }, []);
  const st = drive.status;
  const found = drive.mode === "local" || drive.mode === "remote";
  const checking = drive.mode === "checking";
  const sr = st?.self_repair;
  const checks: Check[] = [
    {
      id: "drive",
      label: found
        ? drive.mode === "remote"
          ? "Drive reached remotely"
          : "Drive plugged in here"
        : "Drive found",
      ok: checking ? null : found,
      fix: "Plug in the drive with the kit in <drive>:\\OFFLINE AI\\OG-BOT\\, or turn on the laptop it's in. Kit below.",
    },
    {
      id: "kit",
      label: st ? `Drive kit up to date (${st.version})` : "Drive kit up to date",
      ok: st ? !older(st.version, KIT_VERSION) : null,
      fix: `Download the kit below again and replace the files on the drive (newest is ${KIT_VERSION}), then replug.`,
    },
    {
      id: "engine",
      label: "AI engine running",
      ok: st ? st.services.ollama || !!engine.online : engine.online,
      fix: "The drive starts it by itself; if not, double-click launch-hub.bat on the drive.",
    },
    {
      id: "coder",
      label: "Default coder installed (qwen2.5-coder:14b)",
      ok: engine.online ? m.live.some((t) => sameTag(t, "qwen2.5-coder:14b")) : null,
      fix: "Settings → AI models → Install next to Qwen 2.5 Coder 14B.",
    },
    {
      id: "images",
      label: "Image & video engine (docked)",
      ok: st ? st.services.comfyui : null,
      fix: "Dock the laptop to the RTX 5080 eGPU; the drive starts ComfyUI only when docked.",
      optional: st?.tier === "handheld",
    },
    {
      id: "remote",
      label: "Paired for remote access",
      ok: st ? st.registered : null,
      fix: "Sign in with Google (D.EV), then Pair this drive below and put og-drive.json on the drive.",
    },
    {
      id: "repair",
      label: "OG BOT self-repair ready",
      ok: sr ? sr.git && sr.bun && sr.token : st ? false : null,
      fix:
        sr && !sr.token
          ? "Pair again below with a Self-repair key (GitHub token)."
          : "Needs kit 1.1.0+ and a Self-repair key; Git and Bun download themselves when online.",
      optional: true,
    },
    {
      id: "app",
      label: "Installed as an app on this device",
      ok: installed,
      fix: "Use Install in the header (or your browser's Install app) so it opens offline.",
      optional: true,
    },
  ];
  const needed = checks.filter((c) => !c.optional);
  const done = needed.filter((c) => c.ok).length;
  return (
    <Panel
      title="Your setup"
      right={
        <span className="font-mono text-[11px] text-muted-foreground">
          {done}/{needed.length} essentials done
        </span>
      }
    >
      <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div
          className="og-gradient h-full transition-all"
          style={{ width: `${(done / needed.length) * 100}%` }}
        />
      </div>
      <ul className="space-y-1.5">
        {checks.map((c) => (
          <li
            key={c.id}
            className={cn(
              "rounded-lg border px-3 py-2",
              c.ok ? "border-success/40 bg-success/5" : "border-border bg-card",
            )}
          >
            <div className="flex items-center gap-2 text-sm">
              {c.ok === null ? (
                <Loader2
                  className="h-4 w-4 shrink-0 animate-spin text-muted-foreground"
                  aria-label="checking"
                />
              ) : c.ok ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-label="done" />
              ) : (
                <Circle className="h-4 w-4 shrink-0 text-muted-foreground" aria-label="to do" />
              )}
              <span className={cn("flex-1", c.ok && "text-foreground/80")}>{c.label}</span>
              {c.optional && (
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  optional
                </span>
              )}
            </div>
            {c.ok === false && <p className="mt-1 pl-6 text-xs text-muted-foreground">{c.fix}</p>}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/** A section that starts folded so the page stays short. */
function Fold({
  title,
  icon,
  open = false,
  children,
}: {
  title: string;
  icon?: ReactNode;
  open?: boolean;
  children: ReactNode;
}) {
  return (
    <details open={open} className="og-fold group rounded-2xl border border-border bg-panel/80">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 font-display text-sm uppercase">
        {icon}
        <span className="flex-1">{title}</span>
        <ChevronDown className="h-4 w-4 text-muted-foreground transition group-open:rotate-180" />
      </summary>
      <div className="border-t border-border px-4 py-3">{children}</div>
    </details>
  );
}

export function SetupGuide() {
  return (
    <div className="mx-auto max-w-5xl space-y-3">
      <div className="flex items-center gap-4 rounded-2xl border border-border bg-panel/80 p-3">
        <img
          src="/og-streamz-brand.webp"
          alt="OGSTREAMZ presentz"
          className="h-20 w-20 rounded-xl object-cover sm:h-24 sm:w-24"
        />
        <BrandMark size="lg" />
      </div>
      <SetupChecklist />

      <Fold title="How it works" icon={<Cpu className="h-4 w-4 text-primary" />}>
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
      </Fold>

      <PairDrive />

      <Fold
        title={`Drive kit · plug in and go (version ${KIT_VERSION})`}
        icon={<Download className="h-4 w-4 text-primary" />}
      >
        <ol className="mb-3 list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
          <li>
            Install this app (step 4) and open it once online, so it works offline afterwards.
          </li>
          <li>
            Download all files below into{" "}
            <span className="font-mono text-foreground">&lt;drive&gt;:\OFFLINE AI\OG-BOT\</span> on
            your drive (any letter: X:, E:, …).
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
      </Fold>

      <Fold title="Recommended models" icon={<Brain className="h-4 w-4 text-primary" />}>
        <div className="grid gap-3 lg:grid-cols-2">
          <Panel title="Language models" right={<Brain className="h-4 w-4 text-primary" />}>
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
      </Fold>
    </div>
  );
}
