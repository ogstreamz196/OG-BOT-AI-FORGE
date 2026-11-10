import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  Settings as Cog,
  LayoutDashboard,
  Grid3x3,
  X,
  MessageSquare,
  Eye,
  Package,
  Music2,
  Clapperboard,
  Image as ImageIcon,
  ShieldCheck,
  Cpu,
  Database as DbIcon,
  Github,
  Code2,
  Plug,
  Palette,
  Activity,
  Brain,
  Download,
  LifeBuoy,
  WifiOff,
  Sparkles,
  Terminal,
} from "lucide-react";
import { SplitView } from "@/components/studio/SplitView";
import { DevWorkbench } from "@/components/studio/DevWorkbench";
import { EngineBadge } from "@/components/studio/EngineBadge";
import { cn } from "@/lib/utils";
// Brand mark served locally by the Worker (the Lovable CDN path does not resolve on Cloudflare).
const LOGO_SRC = "/og-bot-logo.png";
import { Chat } from "@/components/studio/Chat";
import { Create } from "@/components/studio/Create";
import { Preview } from "@/components/studio/Preview";
import { Settings } from "@/components/studio/Settings";
import { Dashboard } from "@/components/studio/Dashboard";
import { Forge } from "@/components/studio/Forge";
import { ImageGen } from "@/components/studio/ImageGen";
import { Music } from "@/components/studio/Music";
import { Hardware } from "@/components/studio/Hardware";
import { Sentinel } from "@/components/studio/Sentinel";
import { Database } from "@/components/studio/Database";
import { GitSync } from "@/components/studio/GitSync";
import { Workbench } from "@/components/studio/Workbench";
import { Connectors } from "@/components/studio/Connectors";
import { Brand } from "@/components/studio/Brand";
import { OllamaTester } from "@/components/studio/OllamaTester";
import { SelfImprove } from "@/components/studio/SelfImprove";
import { PermissionModal } from "@/components/studio/PermissionModal";
import { MusicVideo } from "@/components/studio/MusicVideo";
import { SetupGuide } from "@/components/studio/SetupGuide";
import { DevSignIn } from "@/components/studio/DevSignIn";
import { DEV_ROLE, useDevAuth } from "@/lib/dev-auth";
import { connectors } from "@/lib/connectors";
import { hydrateCloudSections, syncCloudSections } from "@/lib/cloud";

const logo = LOGO_SRC;

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "OG-BOT · Offline AI App Builder" },
      {
        name: "description",
        content:
          "OG-BOT: a fully offline, all-in-one AI app builder. Chat to build, preview live, publish to web or mobile — powered by your own local models.",
      },
      { property: "og:title", content: "OG-BOT · Offline AI App Builder" },
      {
        property: "og:description",
        content: "Chat to build, preview live, publish anywhere. 100% offline local AI.",
      },
    ],
  }),
  component: Studio,
});

type ToolId =
  | "connectors"
  | "brand"
  | "ollama"
  | "selfimprove"
  | "musicvideo"
  | "setup"
  | "forge"
  | "image"
  | "music"
  | "hardware"
  | "sentinel"
  | "database"
  | "git"
  | "workbench";
type Overlay = "settings" | "dash" | "tools" | ToolId | null;

const TOOLS: {
  id: ToolId;
  label: string;
  icon: typeof Package;
  C: React.ComponentType;
  dev?: boolean;
}[] = [
  { id: "connectors", label: "Connectors", icon: Plug, C: Connectors, dev: true },
  { id: "brand", label: "Theme & Brand", icon: Palette, C: Brand },
  { id: "setup", label: "Setup Guide", icon: LifeBuoy, C: SetupGuide },
  { id: "ollama", label: "Ollama Test", icon: Activity, C: OllamaTester, dev: true },
  { id: "selfimprove", label: "Self-Improve", icon: Brain, C: SelfImprove, dev: true },
  { id: "forge", label: "Build & Publish", icon: Package, C: Forge },
  // Image / Song / Video are the primary "Create" view — keep direct studios dev-only to avoid duplicate entry points.
  { id: "image", label: "Image Studio", icon: ImageIcon, C: ImageGen, dev: true },
  { id: "music", label: "Music Forge", icon: Music2, C: Music, dev: true },
  { id: "musicvideo", label: "Music Video Studio", icon: Clapperboard, C: MusicVideo, dev: true },
  { id: "workbench", label: "Advanced Editor", icon: Code2, C: Workbench, dev: true },
  { id: "hardware", label: "Hardware", icon: Cpu, C: Hardware, dev: true },
  { id: "sentinel", label: "USB Sentinel", icon: ShieldCheck, C: Sentinel, dev: true },
  { id: "database", label: "Database", icon: DbIcon, C: Database, dev: true },
  { id: "git", label: "GitHub Sync", icon: Github, C: GitSync, dev: true },
];

const OVERLAY_TITLE: Record<string, string> = {
  settings: "Settings",
  dash: "Developer Dashboard",
  tools: "Tools",
};

function Studio() {
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [view, setView] = useState<"create" | "build" | "dev">("create");

  const dev = useDevAuth();
  const [customerPreview, setCustomerPreview] = useState(false);
  const [devOpen, setDevOpen] = useState(false);
  const effectiveDev = dev.isDev && !customerPreview;
  useEffect(() => {
    if (!effectiveDev && view === "dev") setView("create");
  }, [effectiveDev, view]);
  const tapRef = useRef<number[]>([]);
  const [installEvt, setInstallEvt] = useState<BeforeInstallPromptEvent | null>(null);

  // OG-BOT Cloud: use cached cloud sections immediately, then refresh from the
  // cloud when online / when the connector changes.
  useEffect(() => {
    hydrateCloudSections();
    void syncCloudSections();
    const onOnline = () => void syncCloudSections();
    window.addEventListener("online", onOnline);
    const unsub = connectors.subscribe(() => void syncCloudSections());
    return () => {
      window.removeEventListener("online", onOnline);
      unsub();
    };
  }, []);

  // Capture the PWA install prompt (Android/desktop Chromium).
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  // Discreet DEV entry: Ctrl/Cmd+Shift+D.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "d") {
        e.preventDefault();
        setDevOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Discreet DEV entry: tap the logo 5× within 2s.
  const tapLogo = () => {
    const now = Date.now();
    tapRef.current = [...tapRef.current, now].filter((t) => now - t < 2000);
    if (tapRef.current.length >= 5) {
      tapRef.current = [];
      setDevOpen(true);
    }
  };

  const installApp = async () => {
    if (!installEvt) return;
    await installEvt.prompt();
    setInstallEvt(null);
  };

  const tool = TOOLS.find((t) => t.id === overlay);
  const OverlayBody =
    overlay === "settings" ? (
      <Settings />
    ) : overlay === "dash" ? (
      <Dashboard />
    ) : overlay === "tools" ? (
      <ToolsGrid onPick={setOverlay} dev={effectiveDev} />
    ) : tool ? (
      <tool.C />
    ) : null;
  const overlayTitle = tool ? tool.label : (OVERLAY_TITLE[overlay ?? ""] ?? "");

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      {/* Top bar */}
      <header className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <img
            src={logo}
            alt="OG BOT"
            onClick={tapLogo}
            className="h-8 w-8 cursor-pointer object-contain select-none"
          />
          <div className="font-display text-lg leading-none">OG BOT</div>
          {effectiveDev && (
            <span className="ml-1 rounded border border-primary/60 bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold tracking-widest text-primary">
              {DEV_ROLE}
            </span>
          )}
          <span className="ml-1 hidden items-center gap-1 rounded border border-secondary/60 px-1.5 py-0.5 text-[9px] font-semibold tracking-widest text-secondary sm:flex">
            <WifiOff className="h-2.5 w-2.5" />
            OFFLINE
          </span>
          <EngineBadge />
        </div>

        {/* Primary view switch */}
        <div className="flex items-center rounded-full border border-border bg-card/60 p-0.5">
          {(
            [
              ["create", "Create", Sparkles],
              ["build", "Build", Code2],
              ...(effectiveDev ? ([["dev", "Dev", Terminal]] as const) : []),
            ] as const
          ).map(([v, label, Icon]) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition",
                view === v
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1">
          {installEvt && (
            <button
              onClick={() => void installApp()}
              className="flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-bold text-primary-foreground transition hover:opacity-90"
            >
              <Download className="h-4 w-4" /> Install
            </button>
          )}
          {effectiveDev && (
            <button
              onClick={() => setCustomerPreview(true)}
              className="hidden items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold text-foreground transition hover:border-primary sm:flex"
            >
              <Eye className="h-4 w-4" /> Customer view
            </button>
          )}
          {effectiveDev && (
            <>
              <IconBtn label="Tools" onClick={() => setOverlay("tools")}>
                <Grid3x3 className="h-5 w-5" />
              </IconBtn>
              <IconBtn label="Developer Dashboard" onClick={() => setOverlay("dash")}>
                <LayoutDashboard className="h-5 w-5" />
              </IconBtn>
            </>
          )}
          {!effectiveDev && (
            <IconBtn label="Tools" onClick={() => setOverlay("tools")}>
              <Grid3x3 className="h-5 w-5" />
            </IconBtn>
          )}
          <IconBtn label="Settings" onClick={() => setOverlay("settings")}>
            <Cog className="h-5 w-5" />
          </IconBtn>
        </div>
      </header>

      {/* Create: the AIO gateway, full-width on every size */}
      {view === "create" && (
        <div className="min-h-0 flex-1 overflow-hidden p-3">
          <Create />
        </div>
      )}

      {/* Build: chat + live preview. Pick Chat, Split or Preview; fits any screen. */}
      {view === "build" && (
        <SplitView
          id="build"
          left={<Chat />}
          right={<Preview onPublish={() => setOverlay("forge")} />}
        />
      )}

      {/* Dev Workbench: zero-compromise local coding (qwen2.5-coder:14b by default). */}
      {view === "dev" && effectiveDev && <DevWorkbench />}

      {/* Full-screen overlay */}
      {overlay && (
        <div className="fixed inset-0 z-50 flex flex-col bg-background">
          <header className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="font-display text-lg uppercase">{overlayTitle}</h2>
            <button
              onClick={() => setOverlay(tool ? "tools" : null)}
              aria-label="Close"
              className="rounded p-1.5 text-muted-foreground hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </button>
          </header>
          <div className="flex-1 overflow-y-auto p-4">{OverlayBody}</div>
        </div>
      )}

      {/* Returning to dev while previewing the customer UI (dev only) */}
      {dev.isDev && customerPreview && (
        <button
          onClick={() => setCustomerPreview(false)}
          className="fixed bottom-3 left-3 z-50 flex items-center gap-1 rounded-full border border-primary/60 bg-black/70 px-3 py-1.5 text-xs font-bold text-primary backdrop-blur"
        >
          <Eye className="h-3.5 w-3.5" /> Exit customer view ({DEV_ROLE})
        </button>
      )}

      {devOpen && <DevSignIn onClose={() => setDevOpen(false)} />}
      <PermissionModal />
    </div>
  );
}

function IconBtn({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="rounded-lg p-2 text-muted-foreground transition hover:bg-accent hover:text-foreground"
    >
      {children}
    </button>
  );
}

function ToolsGrid({ onPick, dev }: { onPick: (o: Overlay) => void; dev: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
      {TOOLS.filter((t) => dev || !t.dev).map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          onClick={() => onPick(id)}
          className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-card p-5 text-center transition hover:border-primary hover:text-primary"
        >
          <Icon className="h-7 w-7" />
          <span className="text-xs font-semibold">{label}</span>
        </button>
      ))}
    </div>
  );
}
