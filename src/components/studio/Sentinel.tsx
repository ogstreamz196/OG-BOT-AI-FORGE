import { useEffect, useState } from "react";
import { HardDrive, Lock, ShieldAlert, ShieldCheck, Unlock } from "lucide-react";
import { Panel, Btn } from "./ui";
import { cn } from "@/lib/utils";
import { useDriveLink } from "@/lib/drive-link";
import { usePersistentState } from "@/hooks/use-persistent-state";

export type Identity = { serial: string | null; label: string; total_gb: number | null; free_gb: number | null; kit: string };

/** Is this drive the one the studio is locked to? (No lock = any drive is fine.) */
export function sentinelState(id: Identity | null, bound: string): "no-drive" | "ok" | "unbound" | "wrong" {
  if (!id?.serial) return "no-drive";
  if (!bound) return "unbound";
  return id.serial === bound ? "ok" : "wrong";
}

/** USB Sentinel: the real drive's fingerprint, and an optional lock to that one drive. */
export function Sentinel() {
  const d = useDriveLink();
  const base = d.mode === "local" || d.mode === "remote" ? d.base : null;
  const [id, setId] = useState<Identity | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [bound, setBound] = usePersistentState("og-sentinel-serial", "");

  useEffect(() => {
    if (!base) {
      setId(null);
      return;
    }
    let live = true;
    void (async () => {
      try {
        const r = await fetch(`${base}/og/identity`);
        if (!r.ok) throw new Error(r.status === 404 ? "old-kit" : String(r.status));
        const j = (await r.json()) as Identity;
        if (live) {
          setId(j);
          setErr(null);
        }
      } catch (e) {
        if (live) setErr(e instanceof Error && e.message === "old-kit" ? "Your drive kit is older than 1.2.0. Download the kit again in Setup Guide to use Sentinel." : "Couldn't read the drive.");
      }
    })();
    return () => {
      live = false;
    };
  }, [base]);

  const state = sentinelState(id, bound);
  const good = state === "ok" || state === "unbound";
  const usedPct = id?.total_gb && id.free_gb != null ? Math.round(((id.total_gb - id.free_gb) / id.total_gb) * 100) : null;

  return (
    <div className="mx-auto grid max-w-4xl gap-3 lg:grid-cols-2">
      <Panel title="USB Sentinel">
        <div className="flex items-center gap-4">
          <div className={cn("rounded-full border-2 p-4", good ? "border-primary text-primary glow" : "border-destructive text-destructive")}>
            {good ? <ShieldCheck className="h-10 w-10" /> : <ShieldAlert className="h-10 w-10" />}
          </div>
          <div className="min-w-0">
            <div className={cn("text-lg font-bold", good ? "text-primary" : "text-destructive")}>
              {state === "ok" ? "Your drive · locked to it" : state === "unbound" ? "Drive connected" : state === "wrong" ? "A different drive" : "No drive"}
            </div>
            <p className="text-sm text-muted-foreground">
              {state === "ok"
                ? "This is the drive the studio is locked to."
                : state === "unbound"
                  ? "Any OFFLINE FORGE drive works. Lock to this one if you want."
                  : state === "wrong"
                    ? `Locked to ${bound}, but this drive is ${id?.serial}. Plug in your own drive, or unlock.`
                    : (err ?? d.message)}
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {id?.serial && state !== "ok" && (
            <Btn onClick={() => setBound(id.serial!)}>
              <Lock className="mr-1 inline h-3 w-3" />
              Lock to this drive
            </Btn>
          )}
          {bound && (
            <Btn variant="ghost" onClick={() => setBound("")}>
              <Unlock className="mr-1 inline h-3 w-3" />
              Unlock
            </Btn>
          )}
        </div>
      </Panel>
      <Panel title="This drive">
        {id ? (
          <dl className="grid grid-cols-2 gap-3 text-xs">
            {(
              [
                ["Volume serial", id.serial ?? "unknown"],
                ["Label", id.label || "(none)"],
                ["Space", id.total_gb != null ? `${id.free_gb} GB free of ${id.total_gb} GB` : "unknown"],
                ["Drive kit", id.kit],
              ] as const
            ).map(([k, v]) => (
              <div key={k} className="min-w-0">
                <dt className="text-[10px] uppercase tracking-widest text-muted-foreground">{k}</dt>
                <dd className="truncate font-mono text-foreground" title={v}>{v}</dd>
              </div>
            ))}
            {usedPct != null && (
              <div className="col-span-2">
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className={cn("h-full", usedPct > 90 ? "bg-destructive" : "og-gradient")} style={{ width: `${usedPct}%` }} />
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">{usedPct}% used{usedPct > 90 ? ": remove models you don't use in Settings → AI models." : ""}</p>
              </div>
            )}
          </dl>
        ) : (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <HardDrive className="h-4 w-4" />
            Plug in the drive (or reach it remotely as D.EV) to read its serial and free space.
          </p>
        )}
        <p className="mt-3 text-[11px] text-muted-foreground">Licence keys and device slots are in Dashboard → Licence & devices.</p>
      </Panel>
    </div>
  );
}
