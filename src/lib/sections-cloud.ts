import { createServerFn } from "@tanstack/react-start";
import { SECTIONS, type Section } from "./web-sections";

/**
 * Cloud sections bridge, server-side. The "important sections" live in a
 * Cloudflare D1 database (ogbot-sections) so they can be updated centrally and
 * shared between this app and ogbot.co.uk. This server function reads them via
 * the D1 REST API using a Worker secret — no binding needed — and always falls
 * back to the sections bundled in the app, so it never fails the UI.
 *
 * Worker secrets (optional; falls back to bundled sections if unset):
 *   CLOUDFLARE_API_TOKEN  — a token with D1 read access
 *   CF_ACCOUNT_ID         — default: e7548b9cfc59c9791ad6bfbbc676961c
 *   CF_D1_SECTIONS_ID     — default: bd4def99-8402-4e08-acd7-bfe73be00bb0
 */

const DEFAULT_ACCOUNT = "e7548b9cfc59c9791ad6bfbbc676961c";
const DEFAULT_DB = "bd4def99-8402-4e08-acd7-bfe73be00bb0";

export type CloudSection = Section;
export type CloudSectionsResult = { ok: boolean; source: "cloud" | "bundled"; sections: CloudSection[] };

const bundled = (): CloudSection[] =>
  SECTIONS.map((s) => ({ id: s.id, label: s.label, keywords: s.keywords, html: s.html, css: s.css }));

type D1Row = { id: string; label: string; keywords: string; html: string; css: string };

/** Serve the important sections, preferring the Cloudflare D1 store. */
export const getCloudSections = createServerFn({ method: "GET" }).handler(
  async (): Promise<CloudSectionsResult> => {
    const token = process.env["CLOUDFLARE_API_TOKEN"];
    const account = process.env["CF_ACCOUNT_ID"] || DEFAULT_ACCOUNT;
    const db = process.env["CF_D1_SECTIONS_ID"] || DEFAULT_DB;
    if (!token) return { ok: true, source: "bundled", sections: bundled() };
    try {
      const res = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${db}/query`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ sql: "SELECT id,label,keywords,html,css FROM sections ORDER BY rowid" }),
        },
      );
      if (!res.ok) return { ok: true, source: "bundled", sections: bundled() };
      const data = (await res.json()) as { result?: { results?: D1Row[] }[] };
      const rows = data.result?.[0]?.results ?? [];
      if (!rows.length) return { ok: true, source: "bundled", sections: bundled() };
      const sections: CloudSection[] = rows.map((r) => ({
        id: r.id,
        label: r.label,
        html: r.html,
        css: r.css,
        keywords: parseKeywords(r.keywords),
      }));
      return { ok: true, source: "cloud", sections };
    } catch {
      return { ok: true, source: "bundled", sections: bundled() };
    }
  },
);

function parseKeywords(raw: string): string[] {
  try {
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return raw ? raw.split(",").map((s) => s.trim()).filter(Boolean) : [];
  }
}
