import { Cpu, Plug, Download, ShieldCheck, WifiOff, Clapperboard } from "lucide-react";
import { Panel } from "./ui";

/**
 * Static, self-contained onboarding panel: how to run OG-BOT offline from the
 * drive and connect the local AI. No state, no deps — safe to render anywhere.
 */
const STEPS: { icon: typeof Cpu; title: string; body: string }[] = [
  {
    icon: Cpu,
    title: "1 · Start your local AI",
    body: "Run start_ollama.bat (or `ollama serve` with OLLAMA_ORIGINS=*). Ollama serves at http://127.0.0.1:11434 with models on your drive.",
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

export function SetupGuide() {
  return (
    <div className="space-y-3">
      <Panel title="Setup Guide">
        <p className="mb-3 text-xs text-muted-foreground">
          Run OG-BOT fully offline from your drive. A copy of these steps lives in{" "}
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
    </div>
  );
}
