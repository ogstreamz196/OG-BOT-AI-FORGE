import { useState } from "react";
import { Plug, Check, Loader2, Wifi } from "lucide-react";
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

const CATEGORIES: ConnCategory[] = ["Local AI", "Backend", "Payments", "Integrations"];

function ConnectorCard({ def }: { def: ConnectorDef }) {
  useConnectors();
  const enabled = connectors.isEnabled(def.kind);
  const config = connectors.configOf(def.kind);
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

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
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Plug className={cn("h-4 w-4", enabled ? "text-primary" : "text-muted-foreground")} />
            <span className="font-semibold text-foreground">{def.name}</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{def.blurb}</p>
        </div>
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
      </div>

      {enabled && (
        <div className="mt-3 space-y-2">
          {def.fields.map((f) => (
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
          {def.pingField && (
            <div className="flex items-center gap-2">
              <Btn variant="ghost" onClick={test} disabled={testing}>
                {testing ? (
                  <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />
                ) : (
                  <Wifi className="mr-1 inline h-3 w-3" />
                )}
                Test connection
              </Btn>
              {status && (
                <span
                  className={cn(
                    "font-mono text-[11px]",
                    status.startsWith("connected") ? "text-primary" : "text-destructive",
                  )}
                >
                  {status}
                </span>
              )}
            </div>
          )}
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
          publishable/anon values are safe here; secret keys belong on the Worker.
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
