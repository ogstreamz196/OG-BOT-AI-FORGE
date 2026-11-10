import { useState } from "react";
import { Usb, ShieldCheck, ShieldAlert } from "lucide-react";
import { Panel, Btn, inputCls } from "./ui";
import { FEATURES, isLive, isUnlocked, license, useLicense } from "@/lib/licensing";

export function Sentinel() {
  const lic = useLicense();
  const [key, setKey] = useState(lic.deviceKey);
  const [log, setLog] = useState<string[]>([
    "USB key OG-SENTINEL detected on port 2",
    "License verified locally (Ed25519)",
  ]);

  const add = (s: string) => setLog((l) => [`${new Date().toLocaleTimeString()} ${s}`, ...l]);
  const toggle = () => {
    const next = !lic.plugged;
    license.setPlugged(next);
    add(next ? "USB key inserted — handshake OK" : "USB key removed — running on offline grace");
  };
  const activate = () => {
    const ok = license.activate(key);
    add(ok ? `License ${key} activated` : `Invalid license key "${key}"`);
  };
  const toggleSlot = (n: number) => {
    const bound = !!lic.slots.find((s) => s.slot === n)?.mac;
    license.bindSlot(n);
    add(`Slot ${n} ${bound ? "revoked" : "bound to this device"}`);
  };
  const ok = isLive(lic);

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Panel title="USB Hardware Sentinel">
        <div className="flex items-center gap-4">
          <div
            className={
              ok
                ? "rounded-full border-2 border-primary p-4 text-primary glow"
                : "rounded-full border-2 border-destructive p-4 text-destructive"
            }
          >
            {ok ? <ShieldCheck className="h-10 w-10" /> : <ShieldAlert className="h-10 w-10" />}
          </div>
          <div>
            <div
              className={
                ok ? "text-lg font-bold text-primary" : "text-lg font-bold text-destructive"
              }
            >
              {ok ? "STUDIO UNLOCKED" : "STUDIO LOCKED"}
            </div>
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <Usb className="h-4 w-4" />
              {lic.plugged
                ? `OG-SENTINEL v2 · ${lic.usbSerial}`
                : `No key · ${lic.graceDaysLeft}d offline grace`}
            </div>
          </div>
        </div>
        <Btn variant="ghost" onClick={toggle} className="mt-4">
          {lic.plugged ? "Simulate eject" : "Simulate insert"}
        </Btn>
      </Panel>
      <Panel title="License Manager">
        <div className="space-y-3">
          <label className="block text-xs text-muted-foreground">
            License key (format OGB-XXXX-XXXX-XXXX)
            <input
              className={inputCls}
              value={key}
              onChange={(e) => setKey(e.target.value.toUpperCase())}
            />
          </label>
          <Btn onClick={activate}>Activate offline</Btn>
          <div className="text-xs">
            Status:{" "}
            <span className={lic.activated ? "text-primary" : "text-destructive"}>
              {lic.activated
                ? `${lic.tier.toUpperCase()} · expires ${lic.expires} · ${lic.graceDaysLeft}-day offline grace`
                : "Unlicensed"}
            </span>
          </div>
          <div className="max-h-40 overflow-auto rounded border border-border bg-background p-2 font-mono text-[11px] text-muted-foreground">
            {log.map((l, i) => (
              <div key={i}>{l}</div>
            ))}
          </div>
        </div>
      </Panel>
      <Panel title="Device Slots (3 per licence)" className="lg:col-span-2">
        <ul className="grid gap-2 md:grid-cols-3">
          {lic.slots.map((s) => (
            <li key={s.slot} className="rounded border border-border bg-card p-3 font-mono text-xs">
              <div className="mb-1 text-muted-foreground">
                SLOT {s.slot} · {s.label}
              </div>
              <div className={s.mac ? "text-primary" : "text-muted-foreground"}>
                {s.mac ?? "— unbound —"}
              </div>
              <Btn variant="ghost" className="mt-2" onClick={() => toggleSlot(s.slot)}>
                {s.mac ? "Revoke" : "Bind this device"}
              </Btn>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex flex-wrap gap-1">
          {FEATURES.map((m) => (
            <span
              key={m.id}
              className={
                isUnlocked(m.id, lic)
                  ? "rounded bg-primary/15 px-2 py-0.5 font-mono text-[11px] text-primary"
                  : "rounded bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground line-through"
              }
            >
              {m.id}
            </span>
          ))}
        </div>
      </Panel>
    </div>
  );
}
