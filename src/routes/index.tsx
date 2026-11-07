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
  Image as ImageIcon,
  ShieldCheck,
  Cpu,
  Database as DbIcon,
  Github,
  Code2,
  Plug,
  Palette,
  WifiOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import logoAsset from "@/assets/og-bot-logo.webp.asset.json";
import { Chat } from "@/components/studio/Chat";
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

const logo = logoAsset.url;

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
  | "forge"
  | "image"
  | "music"
  | "hardware"
  | "sentinel"
  | "database"
  | "git"
  | "workbench";
type Overlay = "settings" | "dash" | "tools" | ToolId | null;

const TOOLS: { id: ToolId; label: string; icon: typeof Package; C: React.ComponentType }[] = [
  { id: "connectors", label: "Connectors", icon: Plug, C: Connectors },
  { id: "brand", label: "Theme & Brand", icon: Palette, C: Brand },
  { id: "forge", label: "Build & Publish", icon: Package, C: Forge },
  { id: "image", label: "Image Studio", icon: ImageIcon, C: ImageGen },
  { id: "music", label: "Music Forge", icon: Music2, C: Music },
  { id: "workbench", label: "Advanced Editor", icon: Code2, C: Workbench },
  { id: "hardware", label: "Hardware", icon: Cpu, C: Hardware },
  { id: "sentinel", label: "USB Sentinel", icon: ShieldCheck, C: Sentinel },
  { id: "database", label: "Database", icon: DbIcon, C: Database },
  { id: "git", label: "GitHub Sync", icon: Github, C: GitSync },
];

const OVERLAY_TITLE: Record<string, string> = {
  settings: "Settings",
  dash: "Developer Dashboard",
  tools: "Tools",
};

function Studio() {
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [pane, setPane] = useState<0 | 1>(1); // 0 = chat, 1 = preview
  const pager = useRef<HTMLDivElement>(null);

  // Land on the preview pane on mobile.
  useEffect(() => {
    const el = pager.current;
    if (el) el.scrollLeft = el.clientWidth;
  }, []);

  const goPane = (i: 0 | 1) => {
    const el = pager.current;
    if (el) el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
    setPane(i);
  };

  const onScroll = () => {
    const el = pager.current;
    if (el) setPane(el.scrollLeft > el.clientWidth / 2 ? 1 : 0);
  };

  const tool = TOOLS.find((t) => t.id === overlay);
  const OverlayBody =
    overlay === "settings" ? (
      <Settings />
    ) : overlay === "dash" ? (
      <Dashboard />
    ) : overlay === "tools" ? (
      <ToolsGrid onPick={setOverlay} />
    ) : tool ? (
      <tool.C />
    ) : null;
  const overlayTitle = tool ? tool.label : (OVERLAY_TITLE[overlay ?? ""] ?? "");

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      {/* Top bar */}
      <header className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <img src={logo} alt="OG BOT" className="h-8 w-8 object-contain" />
          <div className="font-display text-lg leading-none">OG BOT</div>
          <span className="ml-1 hidden items-center gap-1 rounded border border-secondary/60 px-1.5 py-0.5 text-[9px] font-semibold tracking-widest text-secondary sm:flex">
            <WifiOff className="h-2.5 w-2.5" />
            OFFLINE
          </span>
        </div>
        <div className="flex items-center gap-1">
          <IconBtn label="Tools" onClick={() => setOverlay("tools")}>
            <Grid3x3 className="h-5 w-5" />
          </IconBtn>
          <IconBtn label="Developer Dashboard" onClick={() => setOverlay("dash")}>
            <LayoutDashboard className="h-5 w-5" />
          </IconBtn>
          <IconBtn label="Settings" onClick={() => setOverlay("settings")}>
            <Cog className="h-5 w-5" />
          </IconBtn>
        </div>
      </header>

      {/* Desktop: two panes side by side */}
      <div className="hidden min-h-0 flex-1 lg:flex">
        <div className="w-[40%] max-w-[480px] border-r border-border">
          <Chat />
        </div>
        <div className="min-w-0 flex-1">
          <Preview onPublish={() => setOverlay("forge")} />
        </div>
      </div>

      {/* Mobile: swipeable pager (chat | preview) */}
      <div className="flex min-h-0 flex-1 flex-col lg:hidden">
        <div
          ref={pager}
          onScroll={onScroll}
          className="flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto scroll-smooth [scrollbar-width:none]"
        >
          <section className="w-full shrink-0 snap-center overflow-hidden">
            <Chat />
          </section>
          <section className="w-full shrink-0 snap-center overflow-hidden">
            <Preview onPublish={() => setOverlay("forge")} />
          </section>
        </div>
        {/* segmented pager control */}
        <div className="flex border-t border-border">
          {(
            [
              [0, "Chat", MessageSquare],
              [1, "Preview", Eye],
            ] as const
          ).map(([i, label, Icon]) => (
            <button
              key={label}
              onClick={() => goPane(i)}
              className={cn(
                "flex flex-1 items-center justify-center gap-2 py-2.5 text-xs font-semibold uppercase tracking-wide transition",
                pane === i ? "bg-primary/10 text-primary" : "text-muted-foreground",
              )}
            >
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>
      </div>

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

function ToolsGrid({ onPick }: { onPick: (o: Overlay) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
      {TOOLS.map(({ id, label, icon: Icon }) => (
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
