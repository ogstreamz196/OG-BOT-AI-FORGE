/**
 * The Database tool's data: the project's own Supabase (through the Supabase connector's
 * publishable key, so row-level security applies), or local tables saved in this browser
 * when no backend is connected. Pure helpers + a tiny REST client.
 */
export type Row = Record<string, unknown>;
export type Query = { table: string; col?: string; val?: string };

/** "SELECT * FROM t [WHERE c = v]" → parts (the console's supported syntax). */
export function parseQuery(sql: string): Query | null {
  const m = sql.trim().match(/^select\s+\*\s+from\s+([\w.]+)(?:\s+where\s+(\w+)\s*=\s*'?([^']*?)'?)?\s*;?$/i);
  if (!m) return null;
  return { table: m[1]!, ...(m[2] ? { col: m[2], val: m[3] ?? "" } : {}) };
}

/** Table names from PostgREST's OpenAPI description. */
export function tablesFromOpenApi(doc: unknown): string[] {
  const d = doc as { definitions?: Record<string, unknown>; paths?: Record<string, unknown> };
  if (d?.definitions) return Object.keys(d.definitions).sort();
  return Object.keys(d?.paths ?? {})
    .map((p) => p.replace(/^\//, ""))
    .filter((p) => p && !p.startsWith("rpc/"))
    .sort();
}

export type Remote = { url: string; key: string };

const headers = (r: Remote, extra: Record<string, string> = {}) => ({
  apikey: r.key,
  Authorization: `Bearer ${r.key}`,
  ...extra,
});
const base = (r: Remote) => `${r.url.replace(/\/+$/, "")}/rest/v1`;

async function ok(res: Response): Promise<Response> {
  if (res.ok) return res;
  let msg = `${res.status}`;
  try {
    const j = (await res.json()) as { message?: string; hint?: string };
    msg = j.message ?? msg;
  } catch {
    /* not JSON */
  }
  throw new Error(res.status === 401 || res.status === 403 ? `Not allowed (row-level security): ${msg}` : msg);
}

export const remoteDb = {
  async tables(r: Remote): Promise<string[]> {
    const res = await ok(await fetch(`${base(r)}/`, { headers: headers(r, { Accept: "application/openapi+json" }) }));
    return tablesFromOpenApi(await res.json());
  },
  async select(r: Remote, q: Query, limit = 50): Promise<Row[]> {
    const p = new URLSearchParams({ select: "*", limit: String(limit) });
    if (q.col) p.set(q.col, `eq.${q.val ?? ""}`);
    const res = await ok(await fetch(`${base(r)}/${encodeURIComponent(q.table)}?${p}`, { headers: headers(r) }));
    return (await res.json()) as Row[];
  },
  async insert(r: Remote, table: string, row: Row): Promise<void> {
    await ok(
      await fetch(`${base(r)}/${encodeURIComponent(table)}`, {
        method: "POST",
        headers: headers(r, { "Content-Type": "application/json", Prefer: "return=minimal" }),
        body: JSON.stringify(row),
      }),
    );
  },
  async remove(r: Remote, table: string, col: string, val: unknown): Promise<void> {
    await ok(
      await fetch(`${base(r)}/${encodeURIComponent(table)}?${col}=eq.${encodeURIComponent(String(val))}`, {
        method: "DELETE",
        headers: headers(r),
      }),
    );
  },
};

/** Run a parsed query against local tables. */
export function runLocal(db: Record<string, Row[]>, q: Query): Row[] | string {
  const rows = db[q.table];
  if (!rows) return `No table called ${q.table}.`;
  return q.col ? rows.filter((r) => String(r[q.col!]) === q.val) : rows;
}
