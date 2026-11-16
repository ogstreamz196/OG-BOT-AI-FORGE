import { useSyncExternalStore } from "react";
import { supabase } from "./supabase";

/**
 * Licensing + feature-gating store: the single source of truth for the
 * customer's tier, per-feature permission overrides, device identity
 * (device key / MAC), offline grace period and bound device slots.
 *
 * Offline-first sync: state starts from built-in defaults (so SSR and the
 * client's first paint match), then on mount hydrates from localStorage and,
 * when configured, from the Supabase `licenses` row. Every change is written
 * through to localStorage immediately and pushed to Supabase (debounced,
 * best-effort) so an air-gapped device keeps working and reconciles when it is
 * next online. Both the Developer Dashboard and the Sentinel read/write here,
 * and the studio shell gates each tab through `isUnlocked`.
 */

export type Tier = "starter" | "pro" | "enterprise";
export const TIERS: Tier[] = ["starter", "pro", "enterprise"];
export const TIER_RANK: Record<Tier, number> = { starter: 0, pro: 1, enterprise: 2 };
export const TIER_LABEL: Record<Tier, string> = {
  starter: "Starter",
  pro: "Pro",
  enterprise: "Enterprise",
};

/** A gateable area of the studio and the minimum tier that unlocks it by default. */
export type Feature = {
  id: string;
  label: string;
  /** Minimum tier required unless an explicit override is set. */
  minTier: Tier;
};

// Keyed by the tab id used in routes/index.tsx.
export const FEATURES: Feature[] = [
  { id: "dash", label: "Dashboard", minTier: "starter" },
  { id: "code", label: "Dev workbench", minTier: "starter" },
  { id: "agent", label: "Build chat (OG BOT)", minTier: "starter" },
  { id: "hw", label: "Hardware", minTier: "starter" },
  { id: "sentinel", label: "USB Sentinel", minTier: "starter" },
  { id: "git", label: "Change history", minTier: "starter" },
  { id: "image", label: "Image Studio", minTier: "pro" },
  { id: "music", label: "Beat Sketchpad", minTier: "pro" },
  { id: "forge", label: "Build & Publish", minTier: "pro" },
  { id: "db", label: "Database", minTier: "pro" },
];

export type DeviceSlot = { slot: number; label: string; mac: string | null };

export type License = {
  tier: Tier;
  customer: string;
  /** ISO date (yyyy-mm-dd). */
  expires: string;
  /** Explicit per-feature unlock overrides; undefined => fall back to tier default. */
  overrides: Record<string, boolean>;
  deviceKey: string;
  /** Legacy field, unused (kept so saved rows still load). */
  mac: string;
  /** The drive's real volume serial, once seen (USB Sentinel / Dashboard). */
  usbSerial: string;
  plugged: boolean;
  activated: boolean;
  /** Remaining days of air-gapped operation before the key must phone home. */
  graceDaysLeft: number;
  slots: DeviceSlot[];
};

const STORAGE_KEY = "og-license-v1";
const ROW_ID = "primary";

function defaultLicense(): License {
  return {
    tier: "pro",
    customer: "Workstation Owner",
    expires: "2027-11-01",
    overrides: {},
    deviceKey: "OGB-7F3A-91C2-XQ8D",
    mac: "",
    usbSerial: "",
    plugged: true,
    activated: true,
    graceDaysLeft: 30,
    slots: [
      { slot: 1, label: "Primary Rig (RTX 5080)", mac: null },
      { slot: 2, label: "Laptop", mac: null },
      { slot: 3, label: "Spare / Testing", mac: null },
    ],
  };
}

// Stable server snapshot — never mutated, so SSR and first client paint agree.
const SERVER_SNAPSHOT: License = defaultLicense();
let state: License = defaultLicense();
const listeners = new Set<() => void>();
let hydrated = false;

/** Map a Supabase `licenses` row to our License shape. */
function fromRow(r: Record<string, unknown>): License {
  const base = defaultLicense();
  return {
    tier: (r["tier"] as Tier) ?? base.tier,
    customer: (r["customer"] as string) ?? base.customer,
    expires: (r["expires"] as string) ?? base.expires,
    overrides: (r["overrides"] as Record<string, boolean>) ?? {},
    deviceKey: (r["device_key"] as string) ?? base.deviceKey,
    mac: (r["mac"] as string) ?? base.mac,
    usbSerial: (r["usb_serial"] as string) ?? base.usbSerial,
    plugged: (r["plugged"] as boolean) ?? base.plugged,
    activated: (r["activated"] as boolean) ?? base.activated,
    graceDaysLeft: (r["grace_days_left"] as number) ?? base.graceDaysLeft,
    slots: (r["slots"] as DeviceSlot[]) ?? base.slots,
  };
}

function toRow(s: License) {
  return {
    id: ROW_ID,
    tier: s.tier,
    customer: s.customer,
    expires: s.expires,
    overrides: s.overrides,
    slots: s.slots,
    device_key: s.deviceKey,
    mac: s.mac,
    usb_serial: s.usbSerial,
    plugged: s.plugged,
    activated: s.activated,
    grace_days_left: s.graceDaysLeft,
  };
}

/** Whether the licence is saved to your account (D.EV sign-in) or only on this device. */
export type SyncState = { status: "local" | "saving" | "synced" | "error"; at: number | null };
let sync: SyncState = { status: supabase ? "saving" : "local", at: null };
const setSync = (status: SyncState["status"]) => {
  sync = { status, at: status === "synced" ? Date.now() : sync.at };
  notify();
};

let pushTimer: ReturnType<typeof setTimeout> | null = null;
function pushRemote() {
  if (!supabase) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    setSync("saving");
    void supabase!
      .from("licenses")
      .upsert(toRow(state))
      .then(
        ({ error }) => setSync(error ? "error" : "synced"),
        () => setSync("error"),
      );
  }, 400);
}

function notify() {
  listeners.forEach((l) => l());
}

/** Pull localStorage then Supabase on first mount (browser only). */
function hydrateOnce() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      state = { ...state, ...(JSON.parse(raw) as Partial<License>) };
      notify();
    }
  } catch {
    /* ignore */
  }
  if (supabase) {
    void supabase
      .from("licenses")
      .select("*")
      .eq("id", ROW_ID)
      .maybeSingle()
      .then(
        ({ data, error }) => {
          if (error) return setSync("error");
          if (data) {
            state = fromRow(data as Record<string, unknown>);
            persist();
            setSync("synced");
          } else {
            pushRemote(); // seed row from current state
          }
        },
        () => setSync("error"),
      );
  }
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* storage blocked — in-memory only */
  }
}

function set(patch: Partial<License>) {
  state = { ...state, ...patch };
  persist();
  pushRemote();
  notify();
}

/** Is a feature unlocked given a license? Override wins; otherwise tier rank vs minTier. */
export function isUnlocked(id: string, lic: License = state): boolean {
  if (id in lic.overrides) return lic.overrides[id]!;
  const f = FEATURES.find((x) => x.id === id);
  if (!f) return true;
  return TIER_RANK[lic.tier] >= TIER_RANK[f.minTier];
}

/** True when the studio is operational: USB present (or within grace) and activated and not expired. */
export function isLive(lic: License = state): boolean {
  const expired = Number.isFinite(Date.parse(lic.expires)) && Date.parse(lic.expires) < Date.now();
  return lic.activated && !expired && (lic.plugged || lic.graceDaysLeft > 0);
}

export const license = {
  get: () => state,
  subscribe(l: () => void) {
    hydrateOnce();
    listeners.add(l);
    return () => listeners.delete(l);
  },
  set,
  setTier: (tier: Tier) => set({ tier }),
  setCustomer: (customer: string) => set({ customer }),
  setExpires: (expires: string) => set({ expires }),
  setPlugged: (plugged: boolean) => set({ plugged }),
  setGrace: (graceDaysLeft: number) => set({ graceDaysLeft: Math.max(0, graceDaysLeft) }),
  /** Cycle a feature override: default → on → off → default. */
  cycleOverride(id: string) {
    const o = { ...state.overrides };
    if (!(id in o)) o[id] = true;
    else if (o[id]) o[id] = false;
    else delete o[id];
    set({ overrides: o });
  },
  activate(key: string): boolean {
    const ok = /^OGB(-[A-Z0-9]{4}){3}$/.test(key.trim());
    set({ deviceKey: key.trim(), activated: ok, graceDaysLeft: ok ? 30 : state.graceDaysLeft });
    return ok;
  },
  /** Bind a slot to a real device id (the drive's volume serial), or free it. */
  bindSlot(slot: number, id?: string | null) {
    const slots = state.slots.map((s) => (s.slot === slot ? { ...s, mac: s.mac ? null : (id ?? null) } : s));
    set({ slots });
  },
  /** Move a slot's binding to another device id. */
  migrateSlot(slot: number, id: string) {
    if (!id.trim()) return;
    const slots = state.slots.map((s) => (s.slot === slot ? { ...s, mac: id.trim() } : s));
    set({ slots });
  },
  regenerateKey() {
    const block = () => Math.random().toString(36).slice(2, 6).toUpperCase().padEnd(4, "X");
    set({ deviceKey: `OGB-${block()}-${block()}-${block()}` });
  },
  /** Record the drive this licence runs from (real volume serial). */
  setDrive(serial: string) {
    if (serial && serial !== state.usbSerial) set({ usbSerial: serial });
  },
  sync: () => sync,
  /** Test helper. */
  _reset() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    hydrated = false;
    state = defaultLicense();
    notify();
  },
};

const LOCAL_SYNC: SyncState = { status: "local", at: null };
export function useLicenseSync() {
  return useSyncExternalStore(license.subscribe, license.sync, () => LOCAL_SYNC);
}

export function useLicense() {
  return useSyncExternalStore(license.subscribe, license.get, () => SERVER_SNAPSHOT);
}
