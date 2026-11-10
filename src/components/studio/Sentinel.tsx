import { useEffect, useState } from "react";
import { Usb, ShieldCheck, ShieldAlert } from "lucide-react";
import { Panel, Btn, Stat, inputCls } from "./ui";
import { loadLicense, loadUsage, saveLicense, type License, type Slot, type Usage } from "@/lib/studio-data";

const MODULES = ["ai-coder", "image-engine", "music-forge", "connectors", "mobile-sdk", "developer-dashboard"];

// Shown until the saved licence loads (or if it can't be reached).
const DEFAULT_SLOTS: Slot[] = [
  { slot: 1, label: "Primary Rig (RTX 5080)", mac: "C8:7F:54:1A:22:9E" },
  { slot: 2, label: "Laptop", mac: null },
  { slot: 3, label: "Spare / Testing", mac: null },
];
const TIER: Record<License["tier"], string> = { starter: "Starter", pro: "Pro", enterprise: "Enterprise" };

export const isValidKey = (key: string) => /^OGB(-[A-Z0-9]{4}){3}$/.test(key.trim());

type Sync = "loading" | "saved" | "saving" | "error";

export function Sentinel() {
  const [lic, setLic] = useState<License | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [sync, setSync] = useState<Sync>("loading");
  const [plugged, setPlugged] = useState(true);
  const [key, setKey] = useState("OGB-7F3A-91C2-XQ8D");
  const [licensed, setLicensed] = useState(true);
  const [slots, setSlots] = useState<Slot[]>(DEFAULT_SLOTS);
  const [log, setLog] = useState<string[]>([]);
  const add = (s: string) => setLog((l) => [`${new Date().toLocaleTimeString()} ${s}`, ...l]);

  useEffect(() => {
    let alive = true;
    Promise.all([loadLicense(), loadUsage()])
      .then(([l, u]) => {
        if (!alive) return;
        setUsage(u);
        if (!l) return setSync("error");
        setLic(l);
        setPlugged(l.plugged);
        setKey(l.device_key);
        setLicensed(l.activated);
        setSlots(l.slots?.length ? l.slots : DEFAULT_SLOTS);
        setSync("saved");
        add("Licence loaded from AI FORGE OFFLINE");
      })
      .catch(() => alive && setSync("error"));
    return () => {
      alive = false;
    };
  }, []);

  const persist = async (patch: Parameters<typeof saveLicense>[0]) => {
    if (!lic) return; // never overwrite the saved licence with demo values
    setSync("saving");
    try {
      await saveLicense(patch);
      setLic({ ...lic, ...patch });
      setSync("saved");
    } catch {
      setSync("error");
      add("Couldn't save to AI FORGE OFFLINE");
    }
  };

  const toggle = () => {
    const next = !plugged;
    setPlugged(next);
    add(next ? "USB key inserted — handshake OK" : "USB key removed — studio locked");
    void persist({ plugged: next });
  };
  const activate = () => {
    const k = key.trim();
    const ok = isValidKey(k);
    setLicensed(ok);
    add(ok ? `License ${k} activated` : `Invalid license key "${k}"`);
    if (ok) void persist({ device_key: k, activated: true });
  };
  const toggleSlot = (n: number) => {
    const mac = Array.from({ length: 6 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, "0").toUpperCase()).join(":");
    const was = slots.find((s) => s.slot === n)?.mac;
    const next = slots.map((s) => (s.slot === n ? { ...s, mac: was ? null : mac } : s));
    setSlots(next);
    add(`Slot ${n} ${was ? "revoked" : `bound to ${mac}`}`);
    void persist({ slots: next });
  };
  const ok = plugged && licensed;
  const status = { loading: "Loading saved licence…", saved: "Saved to AI FORGE OFFLINE", saving: "Saving…", error: "Offline · showing demo values" }[sync];

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Panel title="USB Hardware Sentinel" right={<span className={sync === "error" ? "font-mono text-[10px] text-destructive" : "font-mono text-[10px] text-muted-foreground"}>{status}</span>}>
        <div className="flex items-center gap-4">
          <div className={ok ? "rounded-full border-2 border-primary p-4 text-primary glow" : "rounded-full border-2 border-destructive p-4 text-destructive"}>
            {ok ? <ShieldCheck className="h-10 w-10" /> : <ShieldAlert className="h-10 w-10" />}
          </div>
          <div>
            <div className={ok ? "text-lg font-bold text-primary" : "text-lg font-bold text-destructive"}>{ok ? "STUDIO UNLOCKED" : "STUDIO LOCKED"}</div>
            <div className="flex items-center gap-1 text-sm text-muted-foreground"><Usb className="h-4 w-4" />{plugged ? `OG-SENTINEL v2 · ${lic?.usb_serial ?? "SN 0x4A91"}` : "No key detected"}</div>
          </div>
        </div>
        <Btn variant="ghost" onClick={toggle} className="mt-4">{plugged ? "Simulate eject" : "Simulate insert"}</Btn>
      </Panel>
      <Panel title="License Manager">
        <div className="space-y-3">
          <label className="block text-xs text-muted-foreground">License key (format OGB-XXXX-XXXX-XXXX)<input className={inputCls} value={key} onChange={(e) => setKey(e.target.value.toUpperCase())} /></label>
          <Btn onClick={activate}>Activate offline</Btn>
          <div className="text-xs">
            Status:{" "}
            <span className={licensed ? "text-primary" : "text-destructive"}>
              {licensed ? `${TIER[lic?.tier ?? "pro"]} · ${lic?.customer ?? "Workstation Owner"} · expires ${lic?.expires ?? "2027-11-01"} · ${lic?.grace_days_left ?? 30} days offline grace left` : "Unlicensed"}
            </span>
          </div>
          <div className="max-h-40 overflow-auto rounded border border-border bg-background p-2 font-mono text-[11px] text-muted-foreground">
            {log.map((l, i) => <div key={i}>{l}</div>)}
          </div>
        </div>
      </Panel>
      <Panel title="Device Slots (3 per licence)" className="lg:col-span-2">
        <ul className="grid gap-2 md:grid-cols-3">
          {slots.map((s) => (
            <li key={s.slot} className="rounded border border-border bg-card p-3 font-mono text-xs">
              <div className="mb-1 text-muted-foreground">SLOT {s.slot} · {s.label}</div>
              <div className={s.mac ? "text-primary" : "text-muted-foreground"}>{s.mac ?? "— unbound —"}</div>
              <Btn variant="ghost" className="mt-2" onClick={() => toggleSlot(s.slot)}>{s.mac ? "Revoke" : "Bind this device"}</Btn>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex flex-wrap gap-1">
          {MODULES.map((m) => <span key={m} className="rounded bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground">{m}</span>)}
        </div>
      </Panel>
      <Panel title={`Usage${usage ? ` since ${usage.since}` : ""}`} className="lg:col-span-2">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {(["prompts", "edits", "images", "music", "builds"] as const).map((f) => (
            <Stat key={f} label={f === "prompts" ? "AI prompts" : f === "builds" ? "App builds" : f} value={usage ? String(usage[f]) : "–"} />
          ))}
        </div>
      </Panel>
    </div>
  );
}
