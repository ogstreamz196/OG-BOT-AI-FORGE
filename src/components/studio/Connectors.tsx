import { useState } from "react";
import {
  Plug,
  Check,
  Loader2,
  Wifi,
  Unplug,
  RefreshCw,
  ChevronDown,
  HardDrive,
} from "lucide-react";
import { useDriveLink } from "@/lib/drive-link";
import { Panel, Btn, inputCls } from "./ui";
import { cn } from "@/lib/utils";
import {
  CONNECTOR_CATALOG,
  connectors,
  useConnectors,
  type ConnCategory,
  type ConnectorDef,
} from "@/lib/connectors";
import { pingOllama } from "@/lib/local-ai";
import { models } from "@/lib/models";
import { syncCloudSections } from "@/lib/cloud";

const CATEGORIES: ConnCategory[] = ["Local AI", "Backend", "Payments", "Integrations"];

function ConnectorCard({ def }: { def: ConnectorDef }) {
  useConnectors();
  const enabled = connectors.isEnabled(def.kind);
  const config = connectors.configOf(def.kind);
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const drive = useDriveLink();
  const driveKind = def.kind === "ollama" || def.kind === "comfyui";
  const managed = driveKind && (drive.mode === "local" || drive.mode === "remote");
  const summary = managed
    ? `Managed by your drive · ${drive.mode === "remote" ? "remote" : "plugged in"}`
    : driveKind && !enabled
      ? "Waiting for the drive"
      : enabled
        ? def.fields[0] && config[def.fields[0].key]
          ? String(config[def.fields[0].key])
          : "on"
        : "off";

  const test = async () => {
    if (!def.pingField) return;
    setTesting(true);
    setStatus(null);
    const base = config[def.pingField] || "";
    const r = await pingOllama(base); // /api/tags works for Ollama; others report reachability
    // Feed the real model list into the shared store so the whole app sees it.
    if (r.ok && def.kind === "ollama") models.syncLive(r.models);
    setStatus(r.ok ? `connected · ${r.models.length} models` : `not reachable (${r.message})`);
    setTesting(false);
  };

  return (
    <li className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          {managed ? (
            <HardDrive className="h-4 w-4 shrink-0 text-success" />
          ) : (
            <Plug
              className={cn("h-4 w-4 shrink-0", enabled ? "text-primary" : "text-muted-foreground")}
            />
          )}
          <span className="shrink-0 font-semibold text-foreground">{def.name}</span>
          <span
            className={cn(
              "min-w-0 truncate font-mono text-[11px]",
              managed ? "text-success" : "text-muted-foreground",
            )}
          >
            {summary}
          </span>
          <ChevronDown
            className={cn(
              "ml-auto h-4 w-4 shrink-0 text-muted-foreground transition",
              open && "rotate-180",
            )}
          />
        </button>
        {!managed && (
          <button
            onClick={() => connectors.toggle(def.kind)}
            role="switch"
            aria-checked={enabled}
            aria-label={`Enable ${def.name}`}
            className={cn(
              "mt-0.5 h-6 w-11 shrink-0 rounded-full p-0.5 transition",
              enabled ? "bg-primary" : "bg-muted",
            )}
          >
            <span
              className={cn(
                "block h-5 w-5 rounded-full bg-white transition",
                enabled ? "translate-x-5" : "translate-x-0",
              )}
            />
          </button>
        )}
      </div>

      {open && <p className="mt-2 text-xs text-muted-foreground">{def.blurb}</p>}
      {open && managed && (
        <p className="mt-2 text-xs text-muted-foreground">
          Your drive sets this up by itself (address{" "}
          <span className="font-mono text-foreground">
            {config[def.fields[0]?.key ?? "baseUrl"]}
          </span>
          ), on this device or through the secure tunnel. Nothing to fill in.
        </p>
      )}
      {open && enabled && (
        <div className="mt-3 space-y-2">
          {!managed &&
            def.fields.map((f) => (
              <label key={f.key} className="block text-[11px] text-muted-foreground">
                {f.label}
                {f.secret && <span className="ml-1 text-secondary">· server secret</span>}
                <input
                  className={inputCls}
                  type={f.secret ? "password" : "text"}
                  placeholder={f.placeholder}
                  value={config[f.key] ?? ""}
                  onChange={(e) => connectors.setField(def.kind, f.key, e.target.value)}
                />
              </label>
            ))}
          <div className="flex flex-wrap items-center gap-2">
            {def.pingField && (
              <Btn variant="ghost" onClick={test} disabled={testing}>
                {testing ? (
                  <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />
                ) : (
                  <Wifi className="mr-1 inline h-3 w-3" />
                )}
                Test connection
              </Btn>
            )}
            {def.kind === "ogbotcloud" && (
              <Btn
                variant="ghost"
                onClick={async () => {
                  setTesting(true);
                  const r = await syncCloudSections();
                  setStatus(
                    r.ok ? `synced ${r.count} sections (${r.source})` : `sync failed (${r.source})`,
                  );
                  setTesting(false);
                }}
                disabled={testing}
              >
                {testing ? (
                  <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />
                ) : (
                  <RefreshCw className="mr-1 inline h-3 w-3" />
                )}
                Sync now
              </Btn>
            )}
            {!managed && (
              <Btn variant="ghost" onClick={() => connectors.disconnect(def.kind)}>
                <Unplug className="mr-1 inline h-3 w-3" />
                Disconnect
              </Btn>
            )}
            {status && (
              <span
                className={cn(
                  "font-mono text-[11px]",
                  status.startsWith("connected") || status.startsWith("synced")
                    ? "text-primary"
                    : "text-destructive",
                )}
              >
                {status}
              </span>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

export function Connectors() {
  const s = useConnectors();
  return (
    <div className="space-y-3">
      <Panel
        title="Connectors"
        right={
          <span className="font-mono text-[11px] text-muted-foreground">
            {Object.values(s.enabled).filter(Boolean).length} enabled
          </span>
        }
      >
        <p className="mb-3 text-xs text-muted-foreground">
          Connect local AI engines and cloud services. Local engines (Ollama / ComfyUI) run on your
          machine and keep everything offline. Enabled connectors become available to the AI builder
          and the apps you create. <Check className="inline h-3 w-3 text-primary" />{" "}
          publishable/anon values are safe here; secret keys go in Lovable (Project → Secrets),
          never here.
        </p>
        {CATEGORIES.map((cat) => {
          const list = CONNECTOR_CATALOG.filter((c) => c.category === cat);
          if (!list.length) return null;
          return (
            <div key={cat} className="mb-3">
              <div className="mb-1 text-[10px] uppercase tracking-widest text-muted-foreground">
                {cat}
              </div>
              <ul className="space-y-2">
                {list.map((def) => (
                  <ConnectorCard key={def.kind} def={def} />
                ))}
              </ul>
            </div>
          );
        })}
      </Panel>
    </div>
  );
}
