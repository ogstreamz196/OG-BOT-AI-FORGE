import { useCallback, useEffect, useState } from "react";
import { Database as DbIcon, HardDrive, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Panel, Btn, inputCls } from "./ui";
import { cn } from "@/lib/utils";
import { connectors, useConnectors } from "@/lib/connectors";
import { usePersistentState } from "@/hooks/use-persistent-state";
import { parseQuery, remoteDb, runLocal, type Remote, type Row } from "@/lib/project-db";

/** Starts empty except one clearly-marked example table. */
const LOCAL_START: Record<string, Row[]> = {
  example_notes: [{ id: 1, title: "Example row: delete me", done: "no" }],
};

/** The project's database: its Supabase tables (via the connector) or local tables in this browser. */
export function Database() {
  useConnectors();
  const cfg = connectors.configOf("supabase");
  const remote: Remote | null =
    connectors.isEnabled("supabase") && cfg["url"] && cfg["anonKey"] ? { url: cfg["url"], key: cfg["anonKey"] } : null;
  const [source, setSource] = usePersistentState<"remote" | "local">("og-db-source", "remote");
  const useRemote = source === "remote" && !!remote;

  const [local, setLocal] = usePersistentState<Record<string, Row[]>>("og-local-db-v1", LOCAL_START);
  const [tables, setTables] = useState<string[]>([]);
  const [table, setTable] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<Row[] | string | null>(null);
  const [newTable, setNewTable] = useState("");

  const loadTables = useCallback(async () => {
    setError(null);
    if (!useRemote) {
      const names = Object.keys(local);
      setTables(names);
      setTable((t) => (names.includes(t) ? t : (names[0] ?? "")));
      return;
    }
    setLoading(true);
    try {
      const names = await remoteDb.tables(remote!);
      setTables(names);
      setTable((t) => (names.includes(t) ? t : (names[0] ?? "")));
    } catch (e) {
      setTables([]);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useRemote, remote?.url, remote?.key, Object.keys(local).join(",")]);

  const loadRows = useCallback(async () => {
    if (!table) return setRows([]);
    if (!useRemote) return setRows(local[table] ?? []);
    setLoading(true);
    try {
      setRows(await remoteDb.select(remote!, { table }));
      setError(null);
    } catch (e) {
      setRows([]);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, useRemote, remote?.url, local]);

  useEffect(() => void loadTables(), [loadTables]);
  useEffect(() => {
    void loadRows();
    setQuery(table ? `SELECT * FROM ${table}` : "");
    setResult(null);
  }, [loadRows, table]);

  const cols = rows[0] ? Object.keys(rows[0]) : useRemote ? [] : ["title"];
  const idCol = cols.includes("id") ? "id" : null;

  const insert = async () => {
    const row: Row = Object.fromEntries(Object.entries(draft).filter(([, v]) => v !== ""));
    if (!Object.keys(row).length) return;
    if (useRemote) {
      try {
        await remoteDb.insert(remote!, table, row);
        setDraft({});
        await loadRows();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
      return;
    }
    const list = local[table] ?? [];
    const id = Math.max(0, ...list.map((r) => Number(r["id"]) || 0)) + 1;
    setLocal({ ...local, [table]: [...list, { id, ...row }] });
    setDraft({});
  };

  const del = async (r: Row) => {
    if (!idCol) return;
    if (useRemote) {
      try {
        await remoteDb.remove(remote!, table, idCol, r[idCol]);
        await loadRows();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
      return;
    }
    setLocal({ ...local, [table]: (local[table] ?? []).filter((x) => x[idCol] !== r[idCol]) });
  };

  const run = async () => {
    const q = parseQuery(query);
    if (!q) return setResult("Supported: SELECT * FROM <table> [WHERE column = value]");
    if (!useRemote) return setResult(runLocal(local, q));
    try {
      setResult(await remoteDb.select(remote!, q));
    } catch (e) {
      setResult(e instanceof Error ? e.message : String(e));
    }
  };

  const Grid = ({ data, onDel }: { data: Row[]; onDel?: (r: Row) => void }) => {
    const keys = data[0] ? Object.keys(data[0]) : cols;
    return (
      <div className="overflow-auto">
        <table className="w-full font-mono text-xs">
          <thead>
            <tr>
              {keys.map((c) => (
                <th key={c} className="border-b border-border px-2 py-1 text-left text-primary">{c}</th>
              ))}
              {onDel && idCol && <th />}
            </tr>
          </thead>
          <tbody>
            {data.map((r, i) => (
              <tr key={String(r["id"] ?? i)} className="hover:bg-accent">
                {keys.map((k) => (
                  <td key={k} className="max-w-[16rem] truncate border-b border-border/50 px-2 py-1" title={String(r[k] ?? "")}>
                    {typeof r[k] === "object" ? JSON.stringify(r[k]) : String(r[k] ?? "")}
                  </td>
                ))}
                {onDel && idCol && (
                  <td className="text-right">
                    <button onClick={() => void onDel(r)} className="p-1 text-muted-foreground hover:text-destructive" aria-label="Delete row">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {data.length === 0 && <p className="p-3 text-xs text-muted-foreground">No rows{useRemote ? " you're allowed to see" : ""}.</p>}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs">
        <div role="radiogroup" aria-label="Data source" className="flex gap-1">
          <button
            role="radio"
            aria-checked={useRemote}
            disabled={!remote}
            onClick={() => setSource("remote")}
            className={cn("flex items-center gap-1 rounded-full border px-3 py-1 disabled:opacity-40", useRemote ? "border-primary bg-primary/15 text-primary" : "border-border")}
          >
            <DbIcon className="h-3.5 w-3.5" /> Project database
          </button>
          <button
            role="radio"
            aria-checked={!useRemote}
            onClick={() => setSource("local")}
            className={cn("flex items-center gap-1 rounded-full border px-3 py-1", !useRemote ? "border-primary bg-primary/15 text-primary" : "border-border")}
          >
            <HardDrive className="h-3.5 w-3.5" /> Local tables
          </button>
        </div>
        <span className="text-muted-foreground">
          {useRemote
            ? `Live tables from ${remote!.url.replace(/^https?:\/\//, "")} with the publishable key, so its access rules apply.`
            : remote
              ? "Practice tables saved in this browser."
              : "Practice tables saved in this browser. Connect Supabase in Connectors to work on your project's real tables."}
        </span>
      </div>
      {error && <p role="alert" className="rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs">{error}</p>}
      <div className="grid gap-3 lg:grid-cols-[220px_minmax(0,1fr)]">
        <Panel
          title="Tables"
          right={
            <button onClick={() => void loadTables()} aria-label="Refresh tables" className="text-muted-foreground hover:text-primary">
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            </button>
          }
        >
          <ul className="space-y-1">
            {tables.map((t) => (
              <li key={t}>
                <button
                  onClick={() => setTable(t)}
                  className={cn("w-full truncate rounded px-2 py-1 text-left font-mono text-xs", table === t ? "bg-primary text-primary-foreground" : "hover:bg-accent")}
                >
                  {t}
                  {!useRemote && <span className="opacity-60"> ({local[t]?.length ?? 0})</span>}
                </button>
              </li>
            ))}
            {tables.length === 0 && !loading && <li className="text-xs text-muted-foreground">No tables.</li>}
          </ul>
          {!useRemote && (
            <div className="mt-3 flex gap-1">
              <input
                aria-label="New table name"
                placeholder="new_table"
                className={cn(inputCls, "min-w-0")}
                value={newTable}
                onChange={(e) => setNewTable(e.target.value.replace(/[^\w]/g, "_").toLowerCase())}
              />
              <button
                aria-label="Add table"
                disabled={!newTable || newTable in local}
                onClick={() => {
                  setLocal({ ...local, [newTable]: [] });
                  setTable(newTable);
                  setNewTable("");
                }}
                className="shrink-0 rounded-lg border border-border px-2 hover:border-primary disabled:opacity-40"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </Panel>
        <div className="min-w-0 space-y-3">
          <Panel title={table ? `Table · ${table}` : "Table"}>
            <Grid data={rows} onDel={del} />
            {table && (
              <div className="mt-3 flex flex-wrap gap-2">
                {(cols.length ? cols.filter((c) => c !== "id" && c !== "created_at") : ["title"]).map((c) => (
                  <input key={c} placeholder={c} aria-label={`New ${c}`} className={cn(inputCls, "w-36")} value={draft[c] ?? ""} onChange={(e) => setDraft({ ...draft, [c]: e.target.value })} />
                ))}
                <Btn onClick={() => void insert()}>Insert row</Btn>
              </div>
            )}
          </Panel>
          <Panel title="Query">
            <div className="flex gap-2">
              <input aria-label="Query" className={inputCls} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void run()} />
              <Btn variant="blue" onClick={() => void run()}>Run</Btn>
            </div>
            <div className="mt-3">
              {result === null ? null : typeof result === "string" ? <p className="font-mono text-xs text-destructive">{result}</p> : <Grid data={result} />}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
