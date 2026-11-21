import { Cpu } from "lucide-react";
import { cn } from "@/lib/utils";
import { ctxLabel, engineStatus, useEngineStatus } from "@/lib/engine-status";
import { openTool } from "@/lib/open-tool";

/** Navbar: engine on/off in plain words + the active model; offline → tap opens Engine Test. */
export function EngineBadge() {
  const s = useEngineStatus();
  const color = s.online === null ? "bg-warning animate-pulse" : s.online ? "bg-success" : "bg-destructive";
  const facts = [s.facts.params, ctxLabel(s.facts.context)].filter(Boolean).join(" · ");
  const state = s.online ? "Engine on" : s.online === null ? "Checking engine…" : "Engine off · tap to fix";
  return (
    <button
      onClick={() => (s.online === false ? openTool("ollama") : void engineStatus.refresh())}
      aria-label={`${state}. Model ${s.model}`}
      title={`${state} · ${s.host} · ${s.model}${facts ? ` · ${facts}` : ""}${s.facts.loaded ? " · loaded in memory" : ""}${s.online === false ? "" : ". Click to re-check."}`}
      className="flex min-w-0 shrink items-center gap-1.5 overflow-hidden rounded-full border border-border bg-card/60 px-2 py-1 text-[10px] text-muted-foreground transition hover:border-primary"
    >
      <span className={cn("h-2 w-2 shrink-0 rounded-full", color)} />
      <span className="hidden whitespace-nowrap 2xl:inline">{state}</span>
      <span className="hidden min-w-0 items-center gap-1 whitespace-nowrap rounded bg-muted px-1.5 py-0.5 font-mono text-foreground xl:flex">
        <Cpu className="h-3 w-3 text-primary" />
        {s.model}
        {facts && <span className="text-muted-foreground">· {facts}</span>}
      </span>
    </button>
  );
}
