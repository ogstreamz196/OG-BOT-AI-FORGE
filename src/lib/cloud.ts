import { connectors } from "./connectors";
import { setCloudSections, type Section } from "./web-sections";
import { getCloudSections } from "./sections-cloud";

/**
 * Client-side OG-BOT Cloud bridge. When online and the OG-BOT Cloud connector is
 * enabled, the offline builder pulls the important sections from the cloud
 * (Cloudflare D1) and uses them in place of the bundled set — "when the offline
 * AI comes online, it uses what it needs." Degrades silently offline.
 */

const CACHE_KEY = "og-cloud-sections-v1";

/** Validate an unknown payload into a clean Section[]. Pure + tested. */
export function parseCloudSections(data: unknown): Section[] {
  const arr = Array.isArray(data)
    ? data
    : Array.isArray((data as { sections?: unknown })?.sections)
      ? (data as { sections: unknown[] }).sections
      : [];
  const out: Section[] = [];
  for (const raw of arr) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Partial<Section> & { keywords?: unknown };
    if (typeof r.id === "string" && typeof r.html === "string") {
      out.push({
        id: r.id,
        label: typeof r.label === "string" ? r.label : r.id,
        html: r.html,
        css: typeof r.css === "string" ? r.css : "",
        keywords: Array.isArray(r.keywords)
          ? r.keywords.filter((k): k is string => typeof k === "string")
          : [],
      });
    }
  }
  return out;
}

function cache(sections: Section[]) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(sections));
  } catch {
    /* ignore */
  }
}

/** Apply any cached cloud sections immediately (so offline reloads keep them). */
export function hydrateCloudSections() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) setCloudSections(parseCloudSections(JSON.parse(raw)));
  } catch {
    /* ignore */
  }
}

const isOnline = () => typeof navigator === "undefined" || navigator.onLine;

export type SyncResult = { ok: boolean; source: "cloud" | "bundled" | "external" | "skipped"; count: number };

let lastSync: SyncResult | null = null;
/** The most recent cloud-sync outcome (for status display). */
export function cloudStatus(): SyncResult | null {
  return lastSync;
}

/**
 * Pull the latest important sections. If the OG-BOT Cloud connector names an
 * external hub URL, fetch `${url}/api/sections`; otherwise use this app's own
 * server (which reads Cloudflare D1). Caches and activates them on success.
 */
export async function syncCloudSections(): Promise<SyncResult> {
  const r = await runSync();
  lastSync = r;
  return r;
}

async function runSync(): Promise<SyncResult> {
  if (!isOnline()) return { ok: false, source: "skipped", count: 0 };
  const enabled = connectors.isEnabled("ogbotcloud");
  const base = enabled ? (connectors.configOf("ogbotcloud")["baseUrl"] ?? "").trim() : "";
  try {
    if (base) {
      const res = await fetch(`${base.replace(/\/$/, "")}/api/sections`);
      if (!res.ok) return { ok: false, source: "external", count: 0 };
      const sections = parseCloudSections(await res.json());
      if (!sections.length) return { ok: false, source: "external", count: 0 };
      setCloudSections(sections);
      cache(sections);
      return { ok: true, source: "external", count: sections.length };
    }
    const r = await getCloudSections();
    const sections = parseCloudSections(r.sections);
    if (!sections.length) return { ok: false, source: r.source, count: 0 };
    setCloudSections(sections);
    cache(sections);
    return { ok: true, source: r.source, count: sections.length };
  } catch {
    return { ok: false, source: "skipped", count: 0 };
  }
}
