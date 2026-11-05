import { useState } from "react";
import { Usb, ShieldCheck, ShieldAlert } from "lucide-react";
import { Panel, Btn, inputCls } from "./ui";

const MODULES = ["ai-coder", "image-engine", "music-forge", "connectors", "mobile-sdk", "developer-dashboard"];

export function Sentinel() {
  const [plugged, setPlugged] = useState(true);
  const [key, setKey] = useState("OGB-7F3A-91C2-XQ8D");
  const [licensed, setLicensed] = useState(true);
  const [log, setLog] = useState<string[]>(["USB key OG-SENTINEL detected on port 2", "License verified locally (Ed25519)"]);

  const add = (s: string) => setLog((l) => [`${new Date().toLocaleTimeString()} ${s}`, ...l]);
  const toggle = () => {
    setPlugged(!plugged);
    add(plugged ? "USB key removed — studio locked" : "USB key inserted — handshake OK");
  };
  const activate = () => {
    const ok = /^OGB(-[A-Z0-9]{4}){3}$/.test(key.trim());
    setLicensed(ok);
    add(ok ? `License ${key} activated` : `Invalid license key "${key}"`);
  };
  const [slots, setSlots] = useState<{ slot: number; label: string; mac: string | null }[]>([
    { slot: 1, label: "Primary Rig (RTX 5080)", mac: "C8:7F:54:1A:22:9E" },
    { slot: 2, label: "Laptop", mac: null },
    { slot: 3, label: "Spare / Testing", mac: null },
  ]);
  const toggleSlot = (n: number) => {
    const mac = Array.from({ length: 6 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, "0").toUpperCase()).join(":");
    setSlots((ss) => ss.map((s) => (s.slot === n ? { ...s, mac: s.mac ? null : mac } : s)));
    add(`Slot ${n} ${slots.find((s) => s.slot === n)?.mac ? "revoked" : `bound to ${mac}`}`);
  };
  const ok = plugged && licensed;

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Panel title="USB Hardware Sentinel">
        <div className="flex items-center gap-4">
          <div className={ok ? "rounded-full border-2 border-primary p-4 text-primary glow" : "rounded-full border-2 border-destructive p-4 text-destructive"}>
            {ok ? <ShieldCheck className="h-10 w-10" /> : <ShieldAlert className="h-10 w-10" />}
          </div>
          <div>
            <div className={ok ? "text-lg font-bold text-primary" : "text-lg font-bold text-destructive"}>{ok ? "STUDIO UNLOCKED" : "STUDIO LOCKED"}</div>
            <div className="flex items-center gap-1 text-sm text-muted-foreground"><Usb className="h-4 w-4" />{plugged ? "OG-SENTINEL v2 · SN 0x4A91" : "No key detected"}</div>
          </div>
        </div>
        <Btn variant="ghost" onClick={toggle} className="mt-4">{plugged ? "Simulate eject" : "Simulate insert"}</Btn>
      </Panel>
      <Panel title="License Manager">
        <div className="space-y-3">
          <label className="block text-xs text-muted-foreground">License key (format OGB-XXXX-XXXX-XXXX)<input className={inputCls} value={key} onChange={(e) => setKey(e.target.value.toUpperCase())} /></label>
          <Btn onClick={activate}>Activate offline</Btn>
          <div className="text-xs">Status: <span className={licensed ? "text-primary" : "text-destructive"}>{licensed ? "Enterprise · expires 2027-11-01 · 30-day offline grace" : "Unlicensed"}</span></div>
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
    </div>
  );
}
