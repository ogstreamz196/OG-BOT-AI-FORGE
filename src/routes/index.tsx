import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Code2, Bot, Package, Music2, Image, ShieldCheck, Cpu, Database as DbIcon, WifiOff } from "lucide-react";
import { Workbench } from "@/components/studio/Workbench";
import { Agent } from "@/components/studio/Agent";
import { Forge } from "@/components/studio/Forge";
import { Music } from "@/components/studio/Music";
import { ImageGen } from "@/components/studio/ImageGen";
import { Sentinel } from "@/components/studio/Sentinel";
import { Hardware } from "@/components/studio/Hardware";
import { Database } from "@/components/studio/Database";
import { cn } from "@/lib/utils";
import logo from "@/assets/og-bot-logo.webp";

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
          <h1 className="font-display text-xl uppercase">{TABS.find((t) => t.id === tab)!.label}</h1>
          <span className="flex items-center gap-1 rounded border border-secondary/60 px-2 py-0.5 text-[10px] font-semibold tracking-widest text-secondary"><span className="h-1.5 w-1.5 rounded-full bg-secondary" /><WifiOff className="h-3 w-3" />AIR-GAPPED</span>
        </header>
        <div className="flex-1 p-4"><Active /></div>
      </main>
    </div>
  );
}
