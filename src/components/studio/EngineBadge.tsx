import { Cpu } from "lucide-react";
import { cn } from "@/lib/utils";
import { ctxLabel, engineStatus, useEngineStatus } from "@/lib/engine-status";

/** Navbar: "Local Engine: Online (127.0.0.1:11434)" + active model with size and context. */
export function EngineBadge() {
  const s = useEngineStatus();
  const color =
    s.online === null ? "bg-warning animate-pulse" : s.online ? "bg-primary" : "bg-destructive";
  const facts = [s.facts.params, ctxLabel(s.facts.context)].filter(Boolean).join(" · ");
  return (
    <button
      onClick={() => void engineStatus.refresh()}
      title={`Local Engine: ${s.online ? "Online" : s.online === null ? "checking" : "Offline"} (${s.host}) · ${s.model}${facts ? ` · ${facts}` : ""}${s.facts.loaded ? " · loaded in memory" : ""}. Click to re-check.`}
      className="flex min-w-0 items-center gap-1.5 rounded-full border border-border bg-card/60 px-2 py-1 font-mono text-[10px] text-muted-foreground transition hover:border-primary"
    >
      <span className={cn("h-2 w-2 shrink-0 rounded-full", color)} />
      <span className="hidden xl:inline">
        Local Engine: {s.online ? "Online" : s.online === null ? "…" : "Offline"} ({s.host})
      </span>
      <span className="hidden items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-foreground md:flex">
        <Cpu className="h-3 w-3 text-primary" />
        {s.model}
        {facts && <span className="text-muted-foreground">· {facts}</span>}
      </span>
    </button>
  );
}
