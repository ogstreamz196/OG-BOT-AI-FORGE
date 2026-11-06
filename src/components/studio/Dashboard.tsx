import { useEffect, useState } from "react";
import { QrCode, RefreshCw, Smartphone, Usb } from "lucide-react";
import QR from "qrcode";
import { Panel, Btn, Stat, inputCls } from "./ui";
import {
  FEATURES,
  isUnlocked,
  license,
  TIER_LABEL,
  TIERS,
  useLicense,
  type Feature,
} from "@/lib/licensing";
import { USAGE_META, usage, useUsage } from "@/lib/usage";
import { cn } from "@/lib/utils";

function overrideState(id: string, overrides: Record<string, boolean>): "default" | "on" | "off" {
  if (!(id in overrides)) return "default";
  return overrides[id] ? "on" : "off";
}

/** First-launch QR activation payload (device key + MAC), rendered locally — no network. */
function ActivationQR({ payload }: { payload: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    QR.toDataURL(payload, { width: 160, margin: 1, color: { dark: "#0a0e17", light: "#00f59b" } })
      .then((d) => live && setSrc(d))
      .catch(() => live && setSrc(null));
    return () => {
      live = false;
    };
  }, [payload]);
  return src ? (
    <img
      src={src}
      alt="Activation QR code"
      className="h-40 w-40 rounded-lg border border-border bg-background p-1"
    />
  ) : (
    <div className="flex h-40 w-40 items-center justify-center rounded-lg border border-border text-muted-foreground">
      <QrCode className="h-10 w-10" />
    </div>
  );
}

export function Dashboard() {
  const lic = useLicense();
  const u = useUsage();
  const [migrateTo, setMigrateTo] = useState("");

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          label="Tier"
          value={TIER_LABEL[lic.tier]}
          sub={lic.activated ? "activated" : "not activated"}
        />
        <Stat label="Expires" value={lic.expires} sub="subscription" />
        <Stat label="Offline grace" value={`${lic.graceDaysLeft}d`} sub="air-gapped runtime" />
        <Stat label="Total activity" value={String(usage.total())} sub="this device" />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel
          title="Customer & Subscription"
          right={
            <span className="font-mono text-[11px] text-muted-foreground">remote management</span>
          }
        >
          <div className="space-y-3 text-xs">
            <label className="block text-muted-foreground">
              Customer
              <input
                className={inputCls}
                value={lic.customer}
                onChange={(e) => license.setCustomer(e.target.value)}
              />
            </label>
            <div className="flex gap-2">
              <label className="flex-1 text-muted-foreground">
                Tier
                <select
                  aria-label="Tier"
                  value={lic.tier}
                  onChange={(e) => license.setTier(e.target.value as (typeof TIERS)[number])}
                  className={inputCls}
                >
                  {TIERS.map((t) => (
                    <option key={t} value={t}>
                      {TIER_LABEL[t]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex-1 text-muted-foreground">
                Expiry
                <input
                  type="date"
                  className={inputCls}
                  value={lic.expires}
                  onChange={(e) => license.setExpires(e.target.value)}
                />
              </label>
            </div>
            <label className="block text-muted-foreground">
              Offline grace (days): {lic.graceDaysLeft}
              <input
                type="range"
                min={0}
                max={30}
                value={lic.graceDaysLeft}
                onChange={(e) => license.setGrace(+e.target.value)}
                className="w-full accent-primary"
              />
            </label>
          </div>
        </Panel>

        <Panel
          title="Device Identity & Onboarding"
          right={
            <Btn variant="ghost" onClick={() => license.regenerateKey()}>
              <RefreshCw className="mr-1 inline h-3 w-3" />
              New key
            </Btn>
          }
        >
          <div className="flex flex-wrap items-center gap-4">
            <ActivationQR payload={`ogbot://activate?key=${lic.deviceKey}&mac=${lic.mac}`} />
            <dl className="min-w-0 flex-1 space-y-1 font-mono text-xs">
              {(
                [
                  ["Device Key", lic.deviceKey],
                  ["Host MAC", lic.mac],
                  ["USB Serial", lic.usbSerial],
                ] as const
              ).map(([k, v]) => (
                <div key={k}>
                  <dt className="text-[10px] uppercase tracking-widest text-muted-foreground">
                    {k}
                  </dt>
                  <dd className="truncate text-foreground" title={v}>
                    {v}
                  </dd>
                </div>
              ))}
              <p className="pt-1 text-[11px] text-muted-foreground">
                Scan on first launch to bind this USB to the account.
              </p>
            </dl>
          </div>
        </Panel>
      </div>

      <Panel title="Feature Permissions · Section Gating">
        <p className="mb-3 text-xs text-muted-foreground">
          Each module follows the tier default unless you grant or revoke it here. Click to cycle
          default → granted → revoked.
        </p>
        <ul className="grid gap-2 md:grid-cols-2">
          {FEATURES.map((f: Feature) => {
            const st = overrideState(f.id, lic.overrides);
            const unlocked = isUnlocked(f.id, lic);
            return (
              <li
                key={f.id}
                className="flex items-center justify-between rounded border border-border bg-card px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="truncate font-mono text-xs text-foreground">{f.label}</div>
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                    min {TIER_LABEL[f.minTier]} · {unlocked ? "unlocked" : "locked"}
                  </div>
                </div>
                <button
                  onClick={() => license.cycleOverride(f.id)}
                  className={cn(
                    "rounded px-2 py-1 font-mono text-[11px] uppercase",
                    st === "on" && "bg-primary/20 text-primary",
                    st === "off" && "bg-destructive/20 text-destructive",
                    st === "default" && "bg-muted text-muted-foreground",
                  )}
                >
                  {st === "on" ? "Granted" : st === "off" ? "Revoked" : "Default"}
                </button>
              </li>
            );
          })}
        </ul>
      </Panel>

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="Remote Device Management">
          <div className="space-y-2">
            {lic.slots.map((s) => (
              <div
                key={s.slot}
                className="flex items-center justify-between gap-2 rounded border border-border bg-card px-3 py-2 font-mono text-xs"
              >
                <span className="min-w-0 truncate">
                  <Usb className="mr-1 inline h-3 w-3 text-muted-foreground" />
                  slot {s.slot} ·{" "}
                  <span className={s.mac ? "text-primary" : "text-muted-foreground"}>
                    {s.mac ?? "unbound"}
                  </span>
                </span>
                <span className="flex gap-1">
                  <Btn variant="ghost" onClick={() => license.bindSlot(s.slot)}>
                    {s.mac ? "Unbind" : "Bind"}
                  </Btn>
                </span>
              </div>
            ))}
            <div className="flex gap-2 pt-1">
              <input
                className={inputCls}
                placeholder="New MAC / USB UUID to migrate to slot 1"
                value={migrateTo}
                onChange={(e) => setMigrateTo(e.target.value.toUpperCase())}
              />
              <Btn
                onClick={() => {
                  license.migrateSlot(1, migrateTo);
                  setMigrateTo("");
                }}
              >
                <Smartphone className="mr-1 inline h-3 w-3" />
                Migrate
              </Btn>
            </div>
          </div>
        </Panel>

        <Panel
          title="Local Usage Ledger"
          right={
            <Btn variant="ghost" onClick={() => usage.reset()}>
              Reset
            </Btn>
          }
        >
          <ul className="space-y-2 text-xs">
            {USAGE_META.map((m) => (
              <li
                key={m.key}
                className="flex items-center justify-between rounded border border-border bg-card px-3 py-2 font-mono"
              >
                <span className="text-muted-foreground">{m.label}</span>
                <span className="text-lg text-foreground">{u[m.key] ?? 0}</span>
              </li>
            ))}
            <li className="px-1 pt-1 text-[11px] text-muted-foreground">
              Tracked privately since {u.since}. Never leaves this device.
            </li>
          </ul>
        </Panel>
      </div>
    </div>
  );
}
