import { Check, Download, Trash2, Wifi, WifiOff, Database } from "lucide-react";
import { Panel, Btn } from "./ui";
import { cn } from "@/lib/utils";
import { MODEL_CATALOG, ROLE_LABEL, models, useModels, type ModelRole } from "@/lib/models";
import { license, useLicense } from "@/lib/licensing";
import { usage, useUsage } from "@/lib/usage";
import { workspace } from "@/lib/workspace";
import { hasSupabase } from "@/lib/supabase";

const ROLES: ModelRole[] = ["coder", "reasoning", "chat", "json", "vision", "embed", "image", "music"];

export function Settings() {
  const m = useModels();
  const lic = useLicense();
  const u = useUsage();

  return (
    <div className="space-y-3">
      {m.live.length > 0 && (
        <Panel
          title="Detected on your engine"
          right={
            <span className="font-mono text-[11px] text-primary">{m.live.length} live</span>
          }
        >
          <p className="mb-3 text-xs text-muted-foreground">
            <Check className="mr-1 inline h-3 w-3 text-primary" />
            These models are actually installed on your connected Ollama server — the AI builder and
            router use them automatically. Pick which one drives the chat by default.
          </p>
          <ul className="flex flex-wrap gap-2">
            {m.live.map((tag) => {
              const active = m.active === tag;
              return (
                <li key={tag}>
                  <button
                    onClick={() => models.setActive(active ? null : tag)}
                    className={cn(
                      "flex items-center gap-1 rounded-full border px-3 py-1 font-mono text-[11px] transition",
                      active
                        ? "border-primary bg-primary/15 text-primary"
                        : "border-border bg-card text-muted-foreground hover:border-primary",
                    )}
                  >
                    {active && <Check className="h-3 w-3" />}
                    {tag}
                  </button>
                </li>
              );
            })}
          </ul>
        </Panel>
      )}

      <Panel
        title="Local AI Models"
        right={
          <span className="font-mono text-[11px] text-muted-foreground">
            {models.installedCount()} installed
          </span>
        }
      >
        <p className="mb-3 text-xs text-muted-foreground">
          Download weights into a local engine (Ollama / llama.cpp / ComfyUI), then mark them
          installed here. The active coding model drives the AI builder. 100% offline — nothing is
          sent to the cloud.
        </p>
        {ROLES.map((role) => {
          const list = MODEL_CATALOG.filter((x) => x.role === role);
          if (!list.length) return null;
          return (
            <div key={role} className="mb-3">
              <div className="mb-1 text-[10px] uppercase tracking-widest text-muted-foreground">
                {ROLE_LABEL[role]}
              </div>
              <ul className="space-y-2">
                {list.map((mod) => {
                  const installed = models.statusOf(mod.id) === "installed";
                  const active = m.active === mod.id;
                  return (
                    <li key={mod.id} className="rounded border border-border bg-card px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm text-foreground">{mod.name}</div>
                          <div className="font-mono text-[11px] text-muted-foreground">
                            {mod.size} GB · ~{mod.vram} GB VRAM ·{" "}
                            <span className="text-foreground/70">{mod.pull}</span>
                          </div>
                        </div>
                        {installed ? (
                          <button
                            onClick={() => models.uninstall(mod.id)}
                            className="shrink-0 rounded p-1.5 text-destructive hover:bg-destructive/10"
                            aria-label="Remove"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        ) : (
                          <Btn variant="ghost" onClick={() => models.install(mod.id)}>
                            <Download className="mr-1 inline h-3 w-3" />
                            Mark installed
                          </Btn>
                        )}
                      </div>
                      {installed && (role === "coder" || role === "reasoning") && (
                        <button
                          onClick={() => models.setActive(active ? null : mod.id)}
                          className={cn(
                            "mt-2 flex items-center gap-1 rounded px-2 py-0.5 font-mono text-[11px]",
                            active
                              ? "bg-primary/20 text-primary"
                              : "bg-muted text-muted-foreground",
                          )}
                        >
                          {active && <Check className="h-3 w-3" />}{" "}
                          {active ? "Active model" : "Set as active"}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </Panel>

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="App">
          <div className="space-y-3 text-sm">
            <button
              onClick={() => license.setPlugged(!lic.plugged)}
              className="flex w-full items-center justify-between rounded border border-border bg-card px-3 py-2"
            >
              <span className="flex items-center gap-2 text-foreground">
                {lic.plugged ? (
                  <Wifi className="h-4 w-4 text-primary" />
                ) : (
                  <WifiOff className="h-4 w-4 text-secondary" />
                )}
                USB key / air-gapped
              </span>
              <span
                className={cn("font-mono text-xs", lic.plugged ? "text-primary" : "text-secondary")}
              >
                {lic.plugged ? "connected" : "ejected"}
              </span>
            </button>
            <div className="flex items-center justify-between rounded border border-border bg-card px-3 py-2">
              <span className="flex items-center gap-2 text-foreground">
                <Database className="h-4 w-4 text-muted-foreground" /> Cloud backend (Supabase)
              </span>
              <span
                className={cn(
                  "font-mono text-xs",
                  hasSupabase ? "text-primary" : "text-muted-foreground",
                )}
              >
                {hasSupabase ? "connected" : "offline"}
              </span>
            </div>
            <div className="rounded border border-border bg-card px-3 py-2 font-mono text-xs text-muted-foreground">
              Tier <span className="text-foreground">{lic.tier}</span> · grace {lic.graceDaysLeft}d
              · {usage.total()} actions logged
            </div>
          </div>
        </Panel>

        <Panel title="Data">
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Everything is stored locally on this device (and synced to your own Supabase). Reset
              anything below.
            </p>
            <Btn variant="ghost" className="w-full" onClick={() => workspace.reset()}>
              Reset current project
            </Btn>
            <Btn variant="ghost" className="w-full" onClick={() => usage.reset()}>
              Reset usage ledger ({u.prompts + u.edits + u.images + u.music + u.builds})
            </Btn>
            <Btn variant="ghost" className="w-full" onClick={() => models.setActive(null)}>
              Clear active model
            </Btn>
          </div>
        </Panel>
      </div>
    </div>
  );
}
