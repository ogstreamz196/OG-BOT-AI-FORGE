import { useSyncExternalStore } from "react";

/**
 * Licensing + feature-gating store: the single source of truth for the
 * customer's tier, per-feature permission overrides, device identity
 * (device key / MAC), offline grace period and bound device slots.
 *
 * Both the Developer Dashboard and the Sentinel read and write this store,
 * and the studio shell gates each tab through `isUnlocked`. State is
 * persisted to localStorage (best-effort) so a "licensed" session survives
 * reloads; everything degrades gracefully when storage is unavailable.
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
  { id: "dash", label: "Developer Dashboard", minTier: "starter" },
  { id: "code", label: "AI Coder / Workbench", minTier: "starter" },
  { id: "agent", label: "AI Agent", minTier: "starter" },
  { id: "hw", label: "Hardware Monitor", minTier: "starter" },
  { id: "sentinel", label: "USB Sentinel", minTier: "starter" },
  { id: "git", label: "GitHub Sync", minTier: "starter" },
  { id: "image", label: "Image Studio", minTier: "pro" },
  { id: "music", label: "Music Forge", minTier: "pro" },
  { id: "forge", label: "Mobile Exporter", minTier: "pro" },
  { id: "db", label: "Webhook / Database Manager", minTier: "pro" },
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
  /** Primary host MAC captured at activation (simulated). */
  mac: string;
  /** USB controller serial (simulated SCSI inquiry). */
  usbSerial: string;
  plugged: boolean;
  activated: boolean;
  /** Remaining days of air-gapped operation before the key must phone home. */
  graceDaysLeft: number;
  slots: DeviceSlot[];
};

const STORAGE_KEY = "og-license-v1";

function randMac() {
  return Array.from({ length: 6 }, () =>
    Math.floor(Math.random() * 256)
      .toString(16)
      .padStart(2, "0")
      .toUpperCase(),
  ).join(":");
}

function defaultLicense(): License {
  return {
    tier: "pro",
    customer: "Workstation Owner",
    expires: "2027-11-01",
    overrides: {},
    deviceKey: "OGB-7F3A-91C2-XQ8D",
    mac: "C8:7F:54:1A:22:9E",
    usbSerial: "USB\\OGB_SENTINEL\\0x4A91F0C2",
    plugged: true,
    activated: true,
    graceDaysLeft: 30,
    slots: [
      { slot: 1, label: "Primary Rig (RTX 5080)", mac: "C8:7F:54:1A:22:9E" },
      { slot: 2, label: "Laptop", mac: null },
      { slot: 3, label: "Spare / Testing", mac: null },
    ],
  };
}

function load(): License {
  const base = defaultLicense();
  if (typeof localStorage === "undefined") return base;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return base;
    return { ...base, ...(JSON.parse(raw) as Partial<License>) };
  } catch {
    return base;
  }
}

let state: License = load();
const listeners = new Set<() => void>();

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
  listeners.forEach((l) => l());
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
  bindSlot(slot: number) {
    const slots = state.slots.map((s) =>
      s.slot === slot ? { ...s, mac: s.mac ? null : randMac() } : s,
    );
    set({ slots });
  },
  /** Remote migration: move a slot's binding (and optionally the primary device key) to a new device. */
  migrateSlot(slot: number, mac: string) {
    const slots = state.slots.map((s) => (s.slot === slot ? { ...s, mac: mac || randMac() } : s));
    set({ slots });
  },
  regenerateKey() {
    const block = () => Math.random().toString(36).slice(2, 6).toUpperCase().padEnd(4, "X");
    set({ deviceKey: `OGB-${block()}-${block()}-${block()}`, mac: randMac() });
  },
  /** Test helper. */
  _reset() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    state = defaultLicense();
    listeners.forEach((l) => l());
  },
};

export function useLicense() {
  return useSyncExternalStore(license.subscribe, license.get, license.get);
}
