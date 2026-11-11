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
import { BrandMark } from "@/components/studio/BrandMark";
import { buildHandoff } from "@/lib/build-handoff";
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
import { crumb } from "@/lib/error-log";

const logo = LOGO_SRC;

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "OFFLINE FORGE · OGSTREAMZ presentz · powered by OG BOT" },
      {
        name: "description",
        content:
          "OGSTREAMZ presentz OFFLINE FORGE, powered by OG BOT: a fully offline, all-in-one AI app builder. Chat to build, preview live, publish to web or mobile — powered by your own local models.",
      },
      { property: "og:title", content: "OFFLINE FORGE · OGSTREAMZ presentz" },
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

type ToolGroup = "Make" | "Publish" | "Drive & engine" | "Advanced";
const TOOL_GROUPS: ToolGroup[] = ["Make", "Publish", "Drive & engine", "Advanced"];

const TOOLS: {
  id: ToolId;
  label: string;
  hint: string;
  group: ToolGroup;
  icon: typeof Package;
  C: React.ComponentType;
  dev?: boolean;
}[] = [
  // Image / Song / Video are the primary "Create" view — keep direct studios dev-only to avoid duplicate entry points.
  {
    id: "image",
    label: "Image Studio",
    hint: "Pictures with ComfyUI",
    group: "Make",
    icon: ImageIcon,
    C: ImageGen,
    dev: true,
  },
  {
    id: "music",
    label: "Music Forge",
    hint: "Songs and beats",
    group: "Make",
    icon: Music2,
    C: Music,
    dev: true,
  },
  {
    id: "musicvideo",
    label: "Music Video Studio",
    hint: "Song + scenes into a video",
    group: "Make",
    icon: Clapperboard,
    C: MusicVideo,
    dev: true,
  },
  {
    id: "brand",
    label: "Theme & Brand",
    hint: "Colours and fonts of your site",
    group: "Make",
    icon: Palette,
    C: Brand,
  },
  {
    id: "forge",
    label: "Build & Publish",
    hint: "Web, Android or iOS app",
    group: "Publish",
    icon: Package,
    C: Forge,
  },
  {
    id: "git",
    label: "Change history",
    hint: "See and undo every change",
    group: "Publish",
    icon: Github,
    C: GitSync,
    dev: true,
  },
  {
    id: "setup",
    label: "Setup Guide",
    hint: "Drive kit and pairing",
    group: "Drive & engine",
    icon: LifeBuoy,
    C: SetupGuide,
  },
  {
    id: "ollama",
    label: "Engine Test",
    hint: "Is Ollama answering?",
    group: "Drive & engine",
    icon: Activity,
    C: OllamaTester,
    dev: true,
  },
  {
    id: "hardware",
    label: "Hardware",
    hint: "Live GPU, VRAM, CPU, RAM",
    group: "Drive & engine",
    icon: Cpu,
    C: Hardware,
    dev: true,
  },
  {
    id: "connectors",
    label: "Connectors",
    hint: "Ollama, ComfyUI, cloud",
    group: "Drive & engine",
    icon: Plug,
    C: Connectors,
    dev: true,
  },
  {
    id: "sentinel",
    label: "USB Sentinel",
    hint: "Drive safety lock",
    group: "Drive & engine",
    icon: ShieldCheck,
    C: Sentinel,
    dev: true,
  },
  {
    id: "workbench",
    label: "Advanced Editor",
    hint: "Edit the site's files",
    group: "Advanced",
    icon: Code2,
    C: Workbench,
    dev: true,
  },
  {
    id: "selfimprove",
    label: "Self-Improve",
    hint: "OG BOT's permissions and brain",
    group: "Advanced",
    icon: Brain,
    C: SelfImprove,
    dev: true,
  },
  {
    id: "database",
    label: "Database",
    hint: "Your project's tables",
    group: "Advanced",
    icon: DbIcon,
    C: Database,
    dev: true,
  },
];

const OVERLAY_TITLE: Record<string, string> = {
  settings: "Settings",
  dash: "Developer Dashboard",
  tools: "Tools",
};

function Studio() {
  const [overlay, setOverlayRaw] = useState<Overlay>(null);
  // Where Close goes back to (the Dashboard or the Tools grid that opened this screen).
  const [back, setBack] = useState<Overlay>(null);
  const setOverlay = (next: Overlay) => {
    setBack(
      next && overlay && next !== overlay && (overlay === "dash" || overlay === "tools")
        ? overlay
        : null,
    );
    setOverlayRaw(next);
  };
  const closeOverlay = () => {
    setOverlayRaw(back);
    setBack(null);
  };
  const [view, setView] = useState<"create" | "build" | "dev">("create");

  const dev = useDevAuth();
  const [customerPreview, setCustomerPreview] = useState(false);
  const [devOpen, setDevOpen] = useState(false);
  const effectiveDev = dev.isDev && !customerPreview;
  useEffect(() => {
    if (!effectiveDev && view === "dev") setView("create");
  }, [effectiveDev, view]);
  // Breadcrumbs for the error log: which screen each error happened on.
  useEffect(() => crumb("view", overlay ?? view), [view, overlay]);
  // Create → Build: a website/app request opens Build, where OG BOT starts on it.
  useEffect(() => buildHandoff.onSend(() => setView("build")), []);
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

  // Escape closes the open screen.
  useEffect(() => {
    if (!overlay) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector("[role=dialog]")) closeOverlay();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

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
      <Dashboard onOpen={(id) => TOOLS.some((t) => t.id === id) && setOverlay(id as ToolId)} />
    ) : overlay === "tools" ? (
      <ToolsGrid onPick={setOverlay} dev={effectiveDev} />
    ) : tool ? (
      <tool.C />
    ) : null;
  const overlayTitle = tool ? tool.label : (OVERLAY_TITLE[overlay ?? ""] ?? "");

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      {/* Top bar */}
      <header className="flex items-center justify-between gap-2 border-b border-border px-2 py-2 sm:px-3">
        <div className="flex items-center gap-2">
          <img
            src={logo}
            alt="OG BOT, the assistant powering OFFLINE FORGE"
            onClick={tapLogo}
            className="h-8 w-8 cursor-pointer object-contain select-none"
          />
          <div className="hidden sm:block">
            <BrandMark />
          </div>
          {effectiveDev && (
            <span className="ml-1 hidden rounded border border-primary/60 bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold tracking-widest text-primary sm:inline">
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
              aria-label={label}
              title={label}
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
              onClick={closeOverlay}
              aria-label={back ? `Back to ${OVERLAY_TITLE[back] ?? "previous"}` : "Close"}
              title={back ? `Back to ${OVERLAY_TITLE[back] ?? "previous"} (Esc)` : "Close (Esc)"}
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
  const visible = TOOLS.filter((t) => dev || !t.dev);
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      {TOOL_GROUPS.map((g) => {
        const items = visible.filter((t) => t.group === g);
        if (!items.length) return null;
        return (
          <section key={g}>
            <h3 className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              {g}
            </h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {items.map(({ id, label, hint, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => onPick(id)}
                  className="flex flex-col items-center gap-1.5 rounded-2xl border border-border bg-card p-4 text-center transition hover:border-primary hover:text-primary"
                >
                  <Icon className="h-7 w-7" />
                  <span className="text-xs font-semibold">{label}</span>
                  <span className="text-[10px] leading-tight text-muted-foreground">{hint}</span>
                </button>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
