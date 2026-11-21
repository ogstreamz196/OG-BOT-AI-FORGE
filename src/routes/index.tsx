import { createFileRoute } from "@tanstack/react-router";
import { Suspense, useEffect, useRef, useState } from "react";
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
  Wifi,
  HardDrive,
  Sparkles,
  Terminal,
} from "lucide-react";
import { SplitView } from "@/components/studio/SplitView";
import { EngineBadge } from "@/components/studio/EngineBadge";
import { BrandMark } from "@/components/studio/BrandMark";
import { buildHandoff } from "@/lib/build-handoff";
import { cn } from "@/lib/utils";
// Brand mark served locally by the Worker (the Lovable CDN path does not resolve on Cloudflare).
const LOGO_SRC = "/og-bot-logo-128.webp";
import { Create } from "@/components/studio/Create";
import { PermissionModal } from "@/components/studio/PermissionModal";
import { screens, prefetchScreens } from "@/components/studio/screens";

// Every screen except Create loads when first opened (and is prefetched while idle),
// so the first visit downloads far less.
const {
  Chat,
  Preview,
  DevWorkbench,
  Settings,
  Dashboard,
  Forge,
  ImageGen,
  Music,
  Hardware,
  Sentinel,
  Database,
  GitSync,
  Connectors,
  Brand,
  OllamaTester,
  MusicVideo,
  SetupGuide,
} = screens;
import { DevSignIn } from "@/components/studio/DevSignIn";
import { useDevAuth } from "@/lib/dev-auth";
import { useOnline } from "@/lib/online";
import { useDriveLink } from "@/lib/drive-link";
import { connectors } from "@/lib/connectors";
import { hydrateCloudSections, syncCloudSections } from "@/lib/cloud";
import { crumb } from "@/lib/error-log";
import { OPEN_TOOL_EVENT } from "@/lib/open-tool";

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
  | "musicvideo"
  | "setup"
  | "forge"
  | "image"
  | "music"
  | "hardware"
  | "sentinel"
  | "database"
  | "git";
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
    label: "Beat Sketchpad",
    hint: "Quick melody ideas",
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

  // Once the page is idle, fetch the other screens in the background (Build first), so they
  // open instantly and the service worker caches them for offline use.
  useEffect(() => prefetchScreens(), []);

  // Any screen can ask to open a tool (e.g. Music sketchpad → Music Video Studio).
  useEffect(() => {
    const onOpen = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      if (TOOLS.some((t) => t.id === id) || id === "settings" || id === "dash")
        setOverlayRaw(id as Overlay);
    };
    window.addEventListener(OPEN_TOOL_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_TOOL_EVENT, onOpen);
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
      <Dashboard
        onOpen={(id: string) => TOOLS.some((t) => t.id === id) && setOverlay(id as ToolId)}
      />
    ) : overlay === "tools" ? (
      <ToolsGrid onPick={setOverlay} dev={effectiveDev} />
    ) : tool ? (
      <tool.C />
    ) : null;
  const overlayTitle = tool ? tool.label : (OVERLAY_TITLE[overlay ?? ""] ?? "");

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      {/* Top bar */}
      <header className="og-glass relative z-30 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 border-b border-border/60 px-2 py-2 sm:px-3">
        <div className="flex min-w-0 items-center gap-2">
          <img
            src={logo}
            alt="OG BOT, the assistant powering OFFLINE FORGE"
            onClick={tapLogo}
            className="h-8 w-8 cursor-pointer object-contain select-none"
          />
          <div className="hidden shrink-0 whitespace-nowrap lg:block">
            <BrandMark />
          </div>
          {effectiveDev && (
            <span
              title={dev.email ? `Signed in as D.EV (${dev.email})` : "D.EV mode (local code)"}
              className="ml-1 hidden shrink-0 items-center gap-1 rounded-full border border-primary/60 bg-primary/10 py-0.5 pl-0.5 pr-2 text-[9px] font-bold tracking-widest text-primary md:flex"
            >
              <span
                className="og-gradient flex h-4 w-4 items-center justify-center rounded-full text-[8px] text-primary-foreground"
                aria-hidden
              >
                {(dev.email?.[0] ?? "D").toUpperCase()}
              </span>
              D.EV
            </span>
          )}
          <NetBadge />
          <EngineBadge />
        </div>

        {/* Primary view switch */}
        <div
          className={cn(
            "og-hairline flex items-center rounded-full bg-card/60 p-0.5 transition",
            overlay && "opacity-80",
          )}
        >
          {(
            [
              ["create", "Create", Sparkles],
              ["build", "Build", Code2],
              ...(effectiveDev ? ([["dev", "Dev", Terminal]] as const) : []),
            ] as const
          ).map(([v, label, Icon]) => (
            <button
              key={v}
              onClick={() => {
                setView(v);
                setOverlayRaw(null);
                setBack(null);
              }}
              aria-label={v === "dev" ? "Dev workbench" : label}
              aria-current={view === v && !overlay ? "page" : undefined}
              title={label}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition",
                view === v && !overlay
                  ? "og-gradient text-primary-foreground shadow-md shadow-primary/30"
                  : view === v
                    ? "bg-primary/20 text-foreground"
                    : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>

        <div className="flex items-center justify-self-end gap-1">
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
              aria-label="Customer view"
              title="See the studio as a customer does"
              className="hidden shrink-0 items-center gap-1.5 rounded-lg border border-border px-2 py-1.5 text-xs font-semibold text-foreground transition hover:border-primary sm:flex xl:px-2.5"
            >
              <Eye className="h-4 w-4" /> <span className="hidden xl:inline">Customer view</span>
            </button>
          )}
          {effectiveDev && (
            <>
              <IconBtn
                label="Tools"
                text="Tools"
                active={overlay === "tools" || !!tool}
                onClick={() => setOverlay("tools")}
              >
                <Grid3x3 className="h-5 w-5" />
              </IconBtn>
              <IconBtn
                label="Developer Dashboard"
                text="Dashboard"
                active={overlay === "dash"}
                onClick={() => setOverlay("dash")}
              >
                <LayoutDashboard className="h-5 w-5" />
              </IconBtn>
            </>
          )}
          {!effectiveDev && (
            <IconBtn
              label="Tools"
              text="Tools"
              active={overlay === "tools" || !!tool}
              onClick={() => setOverlay("tools")}
            >
              <Grid3x3 className="h-5 w-5" />
            </IconBtn>
          )}
          <IconBtn
            label="Settings"
            active={overlay === "settings"}
            onClick={() => setOverlay("settings")}
          >
            <Cog className="h-5 w-5" />
          </IconBtn>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1 flex-col">
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
            left={
              <Suspense fallback={<ScreenLoading />}>
                <Chat />
              </Suspense>
            }
            right={
              <Suspense fallback={<ScreenLoading />}>
                <Preview onPublish={() => setOverlay("forge")} />
              </Suspense>
            }
          />
        )}

        {/* Dev Workbench: zero-compromise local coding (qwen2.5-coder:14b by default). */}
        {view === "dev" && effectiveDev && (
          <Suspense fallback={<ScreenLoading />}>
            <DevWorkbench />
          </Suspense>
        )}

        {/* Screen overlay: covers the work area; the main header stays so you can jump anywhere */}
        {overlay && (
          <div className="absolute inset-0 z-40 flex flex-col bg-background">
            <header className="flex items-center justify-between border-b border-border px-4 py-3">
              <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2">
                {back && (
                  <>
                    <button
                      onClick={closeOverlay}
                      className="shrink-0 font-display text-lg uppercase text-muted-foreground hover:text-foreground"
                    >
                      {OVERLAY_TITLE[back] ?? "Back"}
                    </button>
                    <span className="text-muted-foreground" aria-hidden>
                      ›
                    </span>
                  </>
                )}
                <h2 className="truncate font-display text-lg uppercase">{overlayTitle}</h2>
              </nav>
              <button
                onClick={closeOverlay}
                aria-label={back ? `Back to ${OVERLAY_TITLE[back] ?? "previous"}` : "Close"}
                title={back ? `Back to ${OVERLAY_TITLE[back] ?? "previous"} (Esc)` : "Close (Esc)"}
                className="rounded p-1.5 text-muted-foreground hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </header>
            <div className="flex-1 overflow-y-auto p-4">
              <div className="mx-auto w-full max-w-7xl">
                <Suspense fallback={<ScreenLoading />}>{OverlayBody}</Suspense>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Returning to dev while previewing the customer UI (dev only) */}
      {dev.isDev && customerPreview && (
        <button
          onClick={() => setCustomerPreview(false)}
          className="fixed bottom-3 left-3 z-50 flex items-center gap-1 rounded-full border border-primary/60 bg-black/70 px-3 py-1.5 text-xs font-bold text-primary backdrop-blur"
        >
          <Eye className="h-3.5 w-3.5" /> Exit customer view (D.EV)
        </button>
      )}

      {devOpen && <DevSignIn onClose={() => setDevOpen(false)} />}
      <PermissionModal />
    </div>
  );
}

function ScreenLoading() {
  return (
    <div
      className="flex h-full min-h-[200px] items-center justify-center"
      role="status"
      aria-label="Loading"
    >
      <span className="og-typing" aria-hidden>
        <i className="inline-block h-2 w-2 animate-pulse rounded-full bg-primary" />
      </span>
    </div>
  );
}

function IconBtn({
  label,
  text,
  active,
  onClick,
  children,
}: {
  label: string;
  /** Short word shown next to the icon on wide screens. */
  text?: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={cn(
        "flex items-center gap-1.5 rounded-lg p-2 text-muted-foreground transition hover:bg-accent hover:text-foreground",
        active && "bg-accent text-foreground",
      )}
    >
      {children}
      {text && <span className="hidden text-xs font-semibold lg:inline">{text}</span>}
    </button>
  );
}

/** Online / offline and where the drive is, in one chip. */
function NetBadge() {
  const online = useOnline();
  const drive = useDriveLink();
  const [label, Icon, tone] = !online
    ? (["Offline", WifiOff, "border-secondary/60 text-secondary"] as const)
    : drive.mode === "local"
      ? (["Drive here", HardDrive, "border-success/60 text-success"] as const)
      : drive.mode === "remote"
        ? (["Drive remote", HardDrive, "border-success/60 text-success"] as const)
        : (["Online", Wifi, "border-border text-muted-foreground"] as const);
  return (
    <span
      title={online ? drive.message : "No internet: everything on the drive still works"}
      className={cn(
        "ml-1 hidden shrink-0 items-center gap-1 whitespace-nowrap rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-widest lg:flex",
        tone,
      )}
    >
      <Icon className="h-2.5 w-2.5" />
      {label}
    </span>
  );
}

/** Tools that only work with the drive (they're greyed while it's away). */
export const DRIVE_TOOLS = new Set([
  "image",
  "musicvideo",
  "ollama",
  "hardware",
  "sentinel",
  "git",
]);
const RECENT_KEY = "og-recent-tools";
export function rememberTool(id: string) {
  try {
    const prev = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as string[];
    localStorage.setItem(
      RECENT_KEY,
      JSON.stringify([id, ...prev.filter((x) => x !== id)].slice(0, 4)),
    );
  } catch {
    /* private mode */
  }
}

function ToolsGrid({ onPick, dev }: { onPick: (o: Overlay) => void; dev: boolean }) {
  const drive = useDriveLink();
  const driveOn = drive.mode === "local" || drive.mode === "remote";
  const [find, setFind] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  useEffect(() => {
    try {
      setRecent(JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as string[]);
    } catch {
      /* private mode */
    }
  }, []);
  const visible = TOOLS.filter((t) => dev || !t.dev);
  const q = find.trim().toLowerCase();
  const matches = q
    ? visible.filter((t) => `${t.id} ${t.label} ${t.hint} ${t.group}`.toLowerCase().includes(q))
    : visible;
  const recentTools = q
    ? []
    : recent
        .map((id) => visible.find((t) => t.id === id))
        .filter((t): t is (typeof TOOLS)[number] => !!t);

  const card = ({ id, label, hint, icon: Icon }: (typeof TOOLS)[number]) => {
    const needsDrive = DRIVE_TOOLS.has(id);
    const away = needsDrive && !driveOn;
    return (
      <button
        key={id}
        onClick={() => {
          rememberTool(id);
          onPick(id);
        }}
        title={away ? "Needs the drive: plug it in, or reach it remotely as D.EV" : undefined}
        className={cn(
          "relative flex flex-col items-center gap-1.5 rounded-2xl border border-border bg-card p-4 text-center transition hover:border-primary hover:text-primary",
          away && "opacity-55",
        )}
      >
        {needsDrive && (
          <span
            className={cn(
              "absolute right-2 top-2",
              driveOn ? "text-success" : "text-muted-foreground",
            )}
            aria-hidden
          >
            <Plug className="h-3.5 w-3.5" />
          </span>
        )}
        <Icon className="h-7 w-7" />
        <span className="text-xs font-semibold">{label}</span>
        <span className="text-[10px] leading-tight text-muted-foreground">{hint}</span>
        {needsDrive && (
          <span className="sr-only">{driveOn ? "(uses the drive)" : "(needs the drive)"}</span>
        )}
      </button>
    );
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <input
        type="search"
        aria-label="Find a tool"
        placeholder="Find a tool…"
        value={find}
        onChange={(e) => setFind(e.target.value)}
        className="w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm outline-none focus:border-primary"
      />
      {recentTools.length > 0 && (
        <section>
          <h3 className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Recently used
          </h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {recentTools.map(card)}
          </div>
        </section>
      )}
      {TOOL_GROUPS.map((g) => {
        const items = matches.filter((t) => t.group === g);
        if (!items.length) return null;
        return (
          <section key={g}>
            <h3 className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              {g}
            </h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {items.map(card)}
            </div>
          </section>
        );
      })}
      {matches.length === 0 && (
        <p className="text-center text-sm text-muted-foreground">No tool matches “{find}”.</p>
      )}
      {!driveOn && (
        <p className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
          <Plug className="h-3 w-3" /> = needs the drive. {drive.message}.
        </p>
      )}
    </div>
  );
}
