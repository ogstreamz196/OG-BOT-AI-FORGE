import { useEffect, useState } from "react";
import { Check, Database, Download, HardDrive, Loader2, RefreshCw, Trash2, Wifi, WifiOff } from "lucide-react";
import { Panel, Btn } from "./ui";
import { cn } from "@/lib/utils";
import { MODEL_CATALOG, ROLE_LABEL, models, useModels, type ModelDef, type ModelRole } from "@/lib/models";
import { license, useLicense } from "@/lib/licensing";
import { usage, useUsage } from "@/lib/usage";
import { workspace } from "@/lib/workspace";
import { hasSupabase } from "@/lib/supabase";
import { useDriveLink } from "@/lib/drive-link";
import { overLimit } from "@/lib/orchestrator";
import { pullModel, refreshInstalled, removeModel, sameTag, useModelJobs, modelJobs } from "@/lib/model-manager";

const ROLES: ModelRole[] = ["coder", "reasoning", "chat", "json", "vision", "embed", "image", "music"];
/** Image and music models are files for ComfyUI, not Ollama models. */
const FILE_ROLES = new Set<ModelRole>(["image", "music"]);

const SECTIONS = [
  ["models", "AI models"],
  ["workspace", "Workspace & data"],
  ["device", "This device"],
] as const;

export function Settings() {
  const m = useModels();
  const lic = useLicense();
  const u = useUsage();
  const jobs = useModelJobs();
  const drive = useDriveLink();
  const [engineOk, setEngineOk] = useState<boolean | null>(null);
  const [section, setSection] = useState<(typeof SECTIONS)[number][0]>("models");

  const check = async () => {
    setEngineOk(null);
    setEngineOk((await refreshInstalled()) !== null);
  };
  useEffect(() => {
    void check();
  }, [drive.mode, drive.base]);

  const isLive = (def: ModelDef) => m.live.some((t) => sameTag(t, def.pull));
  const extra = m.live.filter((t) => !MODEL_CATALOG.some((d) => sameTag(d.pull, t)));
  const activeTag = models.activeTag();

  return (
    <div className="mx-auto max-w-4xl space-y-3">
      <nav role="tablist" aria-label="Settings sections" className="flex gap-1 overflow-x-auto pb-1">
        {SECTIONS.map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={section === id}
            onClick={() => setSection(id)}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition",
              section === id ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:border-primary",
            )}
          >
            {label}
          </button>
        ))}
      </nav>

      {section === "models" && (
        <Panel
          title="AI models on your drive"
          right={
            <button onClick={() => void check()} className="flex items-center gap-1 font-mono text-[11px] text-muted-foreground hover:text-primary">
              <RefreshCw className={cn("h-3 w-3", engineOk === null && "animate-spin")} />
              {engineOk === null ? "checking…" : engineOk ? `${m.live.length} installed` : "engine offline"}
            </button>
          }
        >
          <p className={cn("mb-3 rounded-lg border px-3 py-2 text-xs", engineOk ? "border-primary/40 bg-primary/5" : "border-warning/50 bg-warning/10")}>
            <HardDrive className="mr-1 inline h-3.5 w-3.5" />
            {engineOk
              ? "Connected to the AI engine on your drive. Install and remove models right here; downloads go straight onto the drive (14B models at most)."
              : "The AI engine isn't answering. Plug in the drive (or turn on the laptop with it in) to install or remove models. Until then this list shows what you marked by hand."}
          </p>

          {ROLES.map((role) => {
            const list = MODEL_CATALOG.filter((x) => x.role === role);
            if (!list.length) return null;
            const files = FILE_ROLES.has(role);
            return (
              <div key={role} className="mb-4">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{ROLE_LABEL[role]}</span>
                  {files && <span className="text-[10px] text-muted-foreground">ComfyUI files · set up in Image Studio</span>}
                </div>
                <ul className="space-y-1.5">
                  {list.map((mod) => {
                    const job = jobs[mod.pull];
                    const installed = files ? models.statusOf(mod.id) === "installed" : engineOk ? isLive(mod) : models.statusOf(mod.id) === "installed";
                    const isDefault = activeTag != null && sameTag(activeTag, mod.pull);
                    const canDefault = installed && (role === "coder" || role === "reasoning");
                    return (
                      <li key={mod.id} className={cn("rounded-lg border bg-card px-3 py-2", installed ? "border-primary/40" : "border-border")}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 text-sm text-foreground">
                              {installed && <Check className="h-3.5 w-3.5 shrink-0 text-primary" aria-label="installed" />}
                              <span className="truncate">{mod.name}</span>
                              {isDefault && <span className="rounded bg-primary/20 px-1.5 py-0.5 text-[10px] font-semibold text-primary">default</span>}
                            </div>
                            <div className="font-mono text-[11px] text-muted-foreground">
                              {mod.size} GB on the drive · needs ~{mod.vram} GB VRAM · {mod.pull}
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-1.5">
                            {canDefault && !isDefault && (
                              <Btn variant="ghost" onClick={() => models.setActive(engineOk ? mod.pull : mod.id)}>Make default</Btn>
                            )}
                            {job && job.status !== "failed" ? (
                              <span className="flex items-center gap-1 font-mono text-[11px] text-primary">
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                {job.status === "removing" ? "removing…" : job.pct != null ? `${job.pct}%` : job.status}
                              </span>
                            ) : files || !engineOk ? (
                              installed ? (
                                <button onClick={() => models.uninstall(mod.id)} className="rounded p-1.5 text-muted-foreground hover:text-destructive" aria-label={`Unmark ${mod.name}`} title="Unmark">
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              ) : (
                                <Btn variant="ghost" onClick={() => models.install(mod.id)}>Mark installed</Btn>
                              )
                            ) : installed ? (
                              <button
                                onClick={() => {
                                  if (window.confirm(`Remove ${mod.pull} from the drive? (${mod.size} GB freed; you can install it again later)`)) void removeModel(mod.pull);
                                }}
                                className="rounded p-1.5 text-muted-foreground hover:text-destructive"
                                aria-label={`Remove ${mod.name}`}
                                title="Remove from the drive"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            ) : (
                              <Btn variant="ghost" disabled={overLimit(mod.pull)} onClick={() => void pullModel(mod.pull)}>
                                <Download className="mr-1 inline h-3 w-3" />
                                Install
                              </Btn>
                            )}
                          </div>
                        </div>
                        {job?.pct != null && job.status !== "failed" && (
                          <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
                            <div className="og-gradient h-full transition-all" style={{ width: `${job.pct}%` }} />
                          </div>
                        )}
                        {job?.status === "failed" && (
                          <p className="mt-1 text-[11px] text-destructive">
                            Couldn't finish: {job.error}.{" "}
                            <button className="underline" onClick={() => modelJobs.clear(mod.pull)}>Dismiss</button>
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}

          {engineOk && extra.length > 0 && (
            <div>
              <div className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Also on your drive</div>
              <ul className="flex flex-wrap gap-1.5">
                {extra.map((tag) => (
                  <li key={tag} className="flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 font-mono text-[11px]">
                    {tag}
                    <button
                      onClick={() => {
                        if (window.confirm(`Remove ${tag} from the drive?`)) void removeModel(tag);
                      }}
                      className="text-muted-foreground hover:text-destructive"
                      aria-label={`Remove ${tag}`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Panel>
      )}

      {section === "workspace" && (
        <Panel title="Workspace & data">
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Your projects, chat and settings are kept in this browser. These reset only what they say.
            </p>
            <Btn variant="ghost" className="w-full" onClick={() => workspace.reset()}>
              Reset current project to its template (undo brings it back)
            </Btn>
            <Btn variant="ghost" className="w-full" onClick={() => usage.reset()}>
              Reset activity counts ({u.prompts + u.edits + u.images + u.music + u.builds})
            </Btn>
            <Btn variant="ghost" className="w-full" onClick={() => models.setActive(null)}>
              Go back to the automatic default model
            </Btn>
          </div>
        </Panel>
      )}

      {section === "device" && (
        <Panel title="This device">
          <div className="space-y-2 text-sm">
            <button
              onClick={() => license.setPlugged(!lic.plugged)}
              className="flex w-full items-center justify-between rounded border border-border bg-card px-3 py-2"
            >
              <span className="flex items-center gap-2 text-foreground">
                {lic.plugged ? <Wifi className="h-4 w-4 text-primary" /> : <WifiOff className="h-4 w-4 text-secondary" />}
                Licence key present
              </span>
              <span className={cn("font-mono text-xs", lic.plugged ? "text-primary" : "text-secondary")}>{lic.plugged ? "yes" : "no"}</span>
            </button>
            <div className="flex items-center justify-between rounded border border-border bg-card px-3 py-2">
              <span className="flex items-center gap-2 text-foreground">
                <Database className="h-4 w-4 text-muted-foreground" /> Cloud sign-in & sync
              </span>
              <span className={cn("font-mono text-xs", hasSupabase ? "text-primary" : "text-muted-foreground")}>{hasSupabase ? "connected" : "offline"}</span>
            </div>
            <div className="rounded border border-border bg-card px-3 py-2 font-mono text-xs text-muted-foreground">
              Tier <span className="text-foreground">{lic.tier}</span> · offline grace {lic.graceDaysLeft} days · {usage.total()} actions on this device
            </div>
          </div>
        </Panel>
      )}
    </div>
  );
}
