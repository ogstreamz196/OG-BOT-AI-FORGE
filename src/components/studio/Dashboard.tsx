import { useCallback, useEffect, useState } from "react";
import {
  QrCode,
  RefreshCw,
  Smartphone,
  Usb,
  Inbox,
  Wifi,
  WifiOff,
  Globe,
  ShieldCheck,
  LogOut,
  HardDrive,
  Bot,
  Cpu,
  Bug,
  History,
  LifeBuoy,
  Activity,
  Plug,
} from "lucide-react";
import QR from "qrcode";
import { Panel, Btn, Stat, inputCls } from "./ui";
import { useOnline } from "@/lib/online";
import { devAuth, useDevAuth, DEV_ROLE } from "@/lib/dev-auth";
import { hasSupabase } from "@/lib/supabase";
import { connectors, useConnectors } from "@/lib/connectors";
import { cloudStatus, syncCloudSections } from "@/lib/cloud";
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
import { getSubmissions, type Submission } from "@/lib/submissions-actions";
import { cn } from "@/lib/utils";
import { useDriveLink } from "@/lib/drive-link";
import { SelfRepairPanel } from "./SelfRepair";
import { useEngineStatus } from "@/lib/engine-status";
import { useErrorLog } from "@/lib/error-log";

export const DASH_TABS = [
  ["overview", "Overview"],
  ["repair", "OG BOT repairs"],
  ["licence", "Licence & devices"],
  ["features", "Features"],
  ["activity", "Activity"],
] as const;
export type DashTab = (typeof DASH_TABS)[number][0];

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

/** Developer Dashboard: tabs so each job is one tap away instead of one long scroll. */
export function Dashboard({ onOpen }: { onOpen?: (tool: string) => void } = {}) {
  const lic = useLicense();
  const u = useUsage();
  const [migrateTo, setMigrateTo] = useState("");
  const [tab, setTab] = useState<DashTab>(() => {
    try {
      const t = typeof window !== "undefined" ? localStorage.getItem("og-dash-tab") : null;
      return DASH_TABS.some(([id]) => id === t) ? (t as DashTab) : "overview";
    } catch {
      return "overview";
    }
  });
  const pick = (t: DashTab) => {
    setTab(t);
    try {
      localStorage.setItem("og-dash-tab", t);
    } catch {
      /* private mode */
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-3">
      <nav
        role="tablist"
        aria-label="Dashboard sections"
        className="sticky top-0 z-10 -mx-1 flex gap-1 overflow-x-auto bg-background/95 px-1 pb-2 backdrop-blur"
      >
        {DASH_TABS.map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => pick(id)}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition",
              tab === id
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:border-primary hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === "overview" && (
        <>
          <HealthOverview onTab={pick} {...(onOpen ? { onOpen } : {})} />
          <RemoteAccessPanel />
        </>
      )}
      {tab === "repair" && <SelfRepairPanel />}

      {tab === "licence" && (
        <>
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
                <span className="font-mono text-[11px] text-muted-foreground">
                  remote management
                </span>
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
        </>
      )}

      {tab === "features" && (
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
      )}

      {tab === "licence" && (
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
      )}

      {tab === "activity" && (
        <div className="grid gap-3 lg:grid-cols-2">
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
          <SubmissionsPanel />
        </div>
      )}
    </div>
  );
}

/** One glance: is everything working, and the one tap to fix what isn't. */
function HealthOverview({
  onTab,
  onOpen,
}: {
  onTab: (t: DashTab) => void;
  onOpen?: (tool: string) => void;
}) {
  const drive = useDriveLink();
  const engine = useEngineStatus();
  const errors = useErrorLog();
  const [repairs, setRepairs] = useState<{ open: number; fixed: number; busy: boolean } | null>(
    null,
  );
  const base = drive.mode === "local" || drive.mode === "remote" ? drive.base : null;
  useEffect(() => {
    if (!base) {
      setRepairs(null);
      return;
    }
    let live = true;
    const load = async () => {
      try {
        const j = (await (await fetch(`${base}/og/repair`)).json()) as {
          busy: boolean;
          errors: { status: string }[];
        };
        if (live)
          setRepairs({
            busy: j.busy,
            open: j.errors.filter((e) =>
              ["new", "fixing", "failed", "needs_owner"].includes(e.status),
            ).length,
            fixed: j.errors.filter((e) => e.status === "fixed" || e.status === "auto_fixed").length,
          });
      } catch {
        if (live) setRepairs(null);
      }
    };
    void load();
    const id = setInterval(() => void load(), 15_000);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, [base]);

  const driveOk = drive.mode === "local" || drive.mode === "remote";
  const unsent = errors.filter((e) => !e.sent && e.kind !== "healed").length;
  const cards: {
    icon: typeof HardDrive;
    label: string;
    value: string;
    sub: string;
    ok: boolean | null;
    go: () => void;
  }[] = [
    {
      icon: HardDrive,
      label: "Drive",
      value:
        drive.mode === "local"
          ? "Plugged in"
          : drive.mode === "remote"
            ? "Remote"
            : drive.mode === "checking"
              ? "Checking…"
              : "Not found",
      sub: drive.message,
      ok: drive.mode === "checking" ? null : driveOk,
      go: () => onOpen?.("setup"),
    },
    {
      icon: Cpu,
      label: "AI engine",
      value: engine.online ? "Running" : "Offline",
      sub: engine.online
        ? `${engine.model}${engine.facts.loaded ? " · loaded" : ""}`
        : "start the drive kit, then test",
      ok: engine.online,
      go: () => onOpen?.("ollama"),
    },
    {
      icon: Bot,
      label: "OG BOT repairs",
      value: repairs
        ? repairs.busy
          ? "Working…"
          : repairs.open
            ? `${repairs.open} open`
            : "All clear"
        : "—",
      sub: repairs ? `${repairs.fixed} fixed so far` : "needs the drive",
      ok: repairs ? repairs.open === 0 : null,
      go: () => onTab("repair"),
    },
    {
      icon: Bug,
      label: "This device",
      value: errors.length ? `${errors.length} logged` : "No errors",
      sub: unsent ? `${unsent} waiting to send to the drive` : "all sent",
      ok: unsent === 0,
      go: () => onTab("repair"),
    },
  ];
  const quick: [string, string, typeof HardDrive][] = [
    ["hardware", "Live hardware", Cpu],
    ["git", "Change history", History],
    ["ollama", "Test the engine", Activity],
    ["connectors", "Connectors", Plug],
    ["setup", "Setup guide", LifeBuoy],
  ];
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {cards.map(({ icon: Icon, label, value, sub, ok, go }) => (
          <button
            key={label}
            onClick={go}
            className="rounded-xl border border-border bg-card p-3 text-left transition hover:border-primary"
          >
            <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-muted-foreground">
              <span className="flex items-center gap-1">
                <Icon className="h-3 w-3" />
                {label}
              </span>
              <span
                className={cn(
                  "h-2 w-2 rounded-full",
                  ok === null ? "bg-muted-foreground" : ok ? "bg-primary" : "bg-destructive",
                )}
                aria-hidden
              />
            </div>
            <div className="mt-1 font-display text-lg">{value}</div>
            <div className="truncate text-[11px] text-muted-foreground" title={sub}>
              {sub}
            </div>
          </button>
        ))}
      </div>
      {onOpen && (
        <div className="flex flex-wrap gap-2">
          {quick.map(([id, label, Icon]) => (
            <button
              key={id}
              onClick={() => onOpen(id)}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold transition hover:border-primary hover:text-primary"
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function RemoteAccessPanel() {
  const online = useOnline();
  const dev = useDevAuth();
  const drive = useDriveLink();
  useConnectors();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [cloudBusy, setCloudBusy] = useState(false);
  const [cloud, setCloud] = useState(cloudStatus());
  const host = typeof window !== "undefined" ? window.location.host : "offline.ogbot.co.uk";

  const cloudOn = connectors.isEnabled("ogbotcloud");
  const cloudText = cloud
    ? cloud.ok
      ? `${cloud.count} sections · ${cloud.source}`
      : `last sync failed (${cloud.source})`
    : cloudOn
      ? "enabled — not synced yet"
      : "off (using built-in sections)";

  const syncCloud = async () => {
    setCloudBusy(true);
    await syncCloudSections();
    setCloud(cloudStatus());
    setCloudBusy(false);
  };

  const signedIn = dev.status === "signed-in" && !!dev.email;
  const access = signedIn
    ? "Google (remote, synced)"
    : dev.localUnlock
      ? "Local code (this device)"
      : "Locked";

  const signIn = async () => {
    setBusy(true);
    setMsg(null);
    const r = await devAuth.signIn();
    setMsg(r.message);
    setBusy(false);
  };

  const rows: [string, string, boolean][] = [
    [
      online ? "Online" : "Offline",
      online ? "remote access available on any device" : "local fallback only",
      online,
    ],
    [
      "Auth backend",
      hasSupabase ? "Supabase configured" : "not configured — local code only",
      hasSupabase,
    ],
    ["DEV session", dev.isDev ? `${DEV_ROLE} active · ${access}` : "not unlocked", dev.isDev],
    ["OG-BOT Cloud", cloudText, cloudOn && !!cloud?.ok],
    [
      "Drive",
      drive.status
        ? `${drive.message} · ${drive.status.hardware.gpu ?? "no eGPU"} · ${drive.status.tier.toUpperCase()}${drive.status.public_url ? " · online" : ""}`
        : drive.message,
      drive.mode === "local" || drive.mode === "remote",
    ],
    ["Access point", host, true],
  ];

  return (
    <Panel
      title="Remote Access"
      right={
        <span
          className={cn(
            "flex items-center gap-1 font-mono text-[11px]",
            online ? "text-primary" : "text-muted-foreground",
          )}
        >
          {online ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
          {online ? "reachable" : "offline"}
        </span>
      }
    >
      <p className="mb-3 text-xs text-muted-foreground">
        <Globe className="mr-1 inline h-3 w-3 text-primary" />
        When online, any allow-listed Google account unlocks {DEV_ROLE} on any device, anywhere —
        the unlock is remembered so it keeps working offline. No internet? Use the local dev code.
      </p>
      <ul className="space-y-1.5">
        {rows.map(([k, v, ok]) => (
          <li
            key={k}
            className="flex items-center justify-between gap-2 rounded border border-border bg-card px-3 py-2 text-xs"
          >
            <span className="font-mono text-muted-foreground">{k}</span>
            <span className="flex min-w-0 items-center gap-1.5">
              <span
                className={cn("h-1.5 w-1.5 shrink-0 rounded-full", ok ? "bg-primary" : "bg-muted")}
              />
              <span className="truncate text-foreground" title={v}>
                {v}
              </span>
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {signedIn || dev.localUnlock ? (
          <Btn variant="ghost" onClick={() => void devAuth.lock()}>
            <LogOut className="mr-1 inline h-3 w-3" />
            Sign out / lock
          </Btn>
        ) : (
          <Btn onClick={() => void signIn()} disabled={busy || !online || !hasSupabase}>
            <ShieldCheck className="mr-1 inline h-3 w-3" />
            Sign in with Google
          </Btn>
        )}
        <Btn variant="ghost" onClick={() => void syncCloud()} disabled={cloudBusy || !online}>
          <RefreshCw className={cn("mr-1 inline h-3 w-3", cloudBusy && "animate-spin")} />
          Sync cloud
        </Btn>
        {msg && <span className="font-mono text-[11px] text-muted-foreground">{msg}</span>}
      </div>
      {!hasSupabase && (
        <p className="mt-2 text-[11px] text-destructive">
          Auth backend not configured in this build — remote sign-in is unavailable; use the local
          code.
        </p>
      )}
    </Panel>
  );
}

function SubmissionsPanel() {
  const [rows, setRows] = useState<Submission[]>([]);
  const [msg, setMsg] = useState("Loading…");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const r = await getSubmissions();
      setRows(r.rows);
      setMsg(r.message);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Panel
      title="Form Submissions"
      right={
        <Btn variant="ghost" onClick={() => void load()} disabled={busy}>
          <RefreshCw className={cn("mr-1 inline h-3 w-3", busy && "animate-spin")} />
          Refresh
        </Btn>
      }
    >
      <p className="mb-2 text-xs text-muted-foreground">
        <Inbox className="mr-1 inline h-3 w-3" />
        Contact-form submissions from your sites ·{" "}
        <span className="font-mono text-foreground">{msg}</span>
      </p>
      {rows.length === 0 ? (
        <p className="rounded border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
          No submissions yet. They appear here once a visitor sends your contact form (needs
          SUPABASE_SERVICE_KEY on the Worker).
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="rounded border border-border bg-card px-3 py-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-foreground">{r.name || "—"}</span>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {new Date(r.created_at).toLocaleString()}
                </span>
              </div>
              <div className="font-mono text-[11px] text-secondary">{r.email}</div>
              <div className="mt-1 text-muted-foreground">{r.message}</div>
              {r.project && (
                <div className="mt-1 text-[10px] uppercase tracking-widest text-muted-foreground">
                  {r.project}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
