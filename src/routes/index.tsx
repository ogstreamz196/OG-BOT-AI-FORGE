import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Code2, Bot, Package, Music2, Image, ShieldCheck, Cpu, Database as DbIcon, WifiOff, Github } from "lucide-react";
import { Workbench } from "@/components/studio/Workbench";
import { Agent } from "@/components/studio/Agent";
import { Forge } from "@/components/studio/Forge";
import { Music } from "@/components/studio/Music";
import { ImageGen } from "@/components/studio/ImageGen";
import { Sentinel } from "@/components/studio/Sentinel";
import { Hardware } from "@/components/studio/Hardware";
import { Database } from "@/components/studio/Database";
import { GitSync } from "@/components/studio/GitSync";
import { cn } from "@/lib/utils";
import logoAsset from "@/assets/og-bot-logo.webp.asset.json";
import battleAsset from "@/assets/og-bot-battle-zone.webp.asset.json";
import trackAsset from "@/assets/og-bot-create-track.webp.asset.json";
import signalsAsset from "@/assets/og-signals.webp.asset.json";
import keysAsset from "@/assets/og-keys.webp.asset.json";
const logo = logoAsset.url;
const DESC: Record<string, string> = {
  code: "Edit your app's code on the left and see it live on the right, on desktop, tablet or phone sizes.",
  agent: "Chat with the offline AI helper. Ask for changes or use quick commands like /scaffold or /export-apk.",
  forge: "Package your app into an Android (APK/AAB) or iPhone (IPA) file ready to install.",
  music: "Pick a style and generate a short music track, then play it back right here.",
  image: "Type a description and generate artwork without needing the internet.",
  sentinel: "Manage your USB licence key, activate licences and choose which devices can use them.",
  hw: "Watch your graphics card, memory and temperature live, and see which AI models your machine can run.",
  db: "Browse and edit your saved data tables, or run simple search queries.",
  git: "Link your GitHub project, save changes with a note, and push or pull updates.",
};

const BADGES: Record<string, { src: string; alt: string }> = {
  agent: { src: battleAsset.url, alt: "OG BOT Battle Zone badge" },
  music: { src: trackAsset.url, alt: "OG BOT Make a Track badge" },
  hw: { src: signalsAsset.url, alt: "OG Signals badge" },
  sentinel: { src: keysAsset.url, alt: "OG Keys badge" },
};

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "OG-BOT · Offline AI Developer Studio" },
      { name: "description", content: "OG-BOT offline AI studio: code editor with live preview, local coding agent, APK forge, music, images, hardware sentinel and database." },
      { property: "og:title", content: "OG-BOT · Offline AI Developer Studio" },
      { property: "og:description", content: "Build, test and package apps with a fully offline local AI workbench." },
    ],
  }),
  component: Studio,
});

const TABS = [
  { id: "code", label: "Workbench", icon: Code2, C: Workbench },
  { id: "agent", label: "AI Agent", icon: Bot, C: Agent },
  { id: "forge", label: "APK Forge", icon: Package, C: Forge },
  { id: "music", label: "Audio Studio", icon: Music2, C: Music },
  { id: "image", label: "Image Gen", icon: Image, C: ImageGen },
  { id: "sentinel", label: "Sentinel", icon: ShieldCheck, C: Sentinel },
  { id: "hw", label: "Hardware", icon: Cpu, C: Hardware },
  { id: "db", label: "Database", icon: DbIcon, C: Database },
  { id: "git", label: "GitHub Sync", icon: Github, C: GitSync },
];

function Studio() {
  const [tab, setTab] = useState("code");
  const Active = TABS.find((t) => t.id === tab)!.C;
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="border-b border-border bg-panel/95 md:w-56 md:border-b-0 md:border-r">
        <div className="flex items-center gap-3 px-4 py-4">
          <img src={logo} alt="OG BOT mascot logo" className="h-12 w-12 object-contain" />
          <div>
            <div className="font-display text-2xl leading-none text-foreground">OG BOT</div>
            <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">Offline AI Studio</div>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col">
          {TABS.map(({ id, label, icon: I }) => (
            <button key={id} onClick={() => setTab(id)} className={cn("flex shrink-0 items-center gap-2 rounded px-3 py-2 text-sm transition", tab === id ? "bg-primary/10 text-primary border-l-2 border-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground")}>
              <I className="h-4 w-4" />{label}
            </button>
          ))}
        </nav>
      </aside>
      <main className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-border px-4 py-2">
          <h1 className="flex items-center gap-2 font-display text-xl uppercase">{BADGES[tab] && <img src={BADGES[tab].src} alt={BADGES[tab].alt} className="h-9 w-9 rounded-md object-cover" />}{TABS.find((t) => t.id === tab)!.label}</h1>
          <span className="flex items-center gap-1 rounded border border-secondary/60 px-2 py-0.5 text-[10px] font-semibold tracking-widest text-secondary"><span className="h-1.5 w-1.5 rounded-full bg-secondary" /><WifiOff className="h-3 w-3" />AIR-GAPPED</span>
        </header>
        <p className="border-b border-border px-4 py-2 text-xs text-muted-foreground">{DESC[tab]}</p>
        <div className="flex-1 p-4"><Active /></div>
      </main>
    </div>
  );
}
