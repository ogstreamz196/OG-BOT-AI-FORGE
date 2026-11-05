import { useState } from "react";
import { Panel, Btn, inputCls } from "./ui";
import { cn } from "@/lib/utils";

type Row = { id: number } & Record<string, string | number>;
const INIT: Record<string, Row[]> = {
  projects: [
    { id: 1, name: "Neon Notes", platform: "android", status: "built" },
    { id: 2, name: "Pulse Player", platform: "web", status: "draft" },
  ],
  models: [
    { id: 1, name: "og-coder-7b", size_gb: 4.1 },
    { id: 2, name: "og-diffusion-xl-lite", size_gb: 6.5 },
  ],
  users: [{ id: 1, name: "Faiyaz", role: "owner" }],
};

export function Database() {
  const [db, setDb] = useState(INIT);
  const [table, setTable] = useState("projects");
  const [query, setQuery] = useState("SELECT * FROM projects");
  const [result, setResult] = useState<Row[] | string>(INIT["projects"] ?? []);
  const [draft, setDraft] = useState<Row>({});

  const rows = db[table] ?? [];
  const cols = rows[0] ? Object.keys(rows[0]) : ["id"];

  const exec = () => {
    const m = query.trim().match(/^select\s+\*\s+from\s+(\w+)(?:\s+where\s+(\w+)\s*=\s*'?([^']+?)'?)?;?$/i);
    if (!m || !db[m[1]]) return setResult("Error: supported syntax — SELECT * FROM <table> [WHERE col = value]");
    const [, t, col, val] = m as unknown as string[];
    let r: Row[] = db[t] ?? [];
    if (col) r = r.filter((x) => String(x[col]) === val);
    setResult(r);
  };
  const addRow = () => {
    const id = Math.max(0, ...rows.map((r) => Number(r.id))) + 1;
    const row = { id } as Row;
    cols.filter((c) => c !== "id").forEach((c) => (row[c] = draft[c] ?? ""));
    setDb({ ...db, [table]: [...rows, row] });
    setDraft({});
  };
  const del = (id: number) => setDb({ ...db, [table]: rows.filter((r) => r.id !== id) });

  const Table = ({ data, onDel }: { data: Row[]; onDel?: (id: number) => void }) => (
    <div className="overflow-auto">
      <table className="w-full font-mono text-xs">
        <thead><tr>{(data[0] ? Object.keys(data[0]) : cols).map((c) => <th key={c} className="border-b border-border px-2 py-1 text-left text-primary">{c}</th>)}{onDel && <th />}</tr></thead>
        <tbody>
          {data.map((r) => (
            <tr key={String(r.id)} className="hover:bg-accent">
              {Object.values(r).map((v, i) => <td key={i} className="border-b border-border/50 px-2 py-1">{String(v)}</td>)}
              {onDel && <td className="text-right"><button onClick={() => onDel(r.id)} className="text-destructive hover:underline">del</button></td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="grid gap-3 lg:grid-cols-[200px_1fr]">
      <Panel title="Tables">
        <ul className="space-y-1">
          {Object.keys(db).map((t) => (
            <li key={t}><button onClick={() => setTable(t)} className={cn("w-full rounded px-2 py-1 text-left font-mono text-xs", table === t ? "bg-primary text-primary-foreground" : "hover:bg-accent")}>{t} <span className="opacity-60">({db[t]?.length ?? 0})</span></button></li>
          ))}
        </ul>
      </Panel>
      <div className="space-y-3">
        <Panel title={`Table · ${table}`}>
          <Table data={rows} onDel={del} />
          <div className="mt-3 flex flex-wrap gap-2">
            {cols.filter((c) => c !== "id").map((c) => (
              <input key={c} placeholder={c} className={cn(inputCls, "w-36")} value={String(draft[c] ?? "")} onChange={(e) => setDraft({ ...draft, [c]: e.target.value })} />
            ))}
            <Btn onClick={addRow}>Insert row</Btn>
          </div>
        </Panel>
        <Panel title="SQL Console">
          <div className="flex gap-2"><input className={inputCls} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && exec()} /><Btn variant="blue" onClick={exec}>Execute</Btn></div>
          <div className="mt-3">{typeof result === "string" ? <p className="font-mono text-xs text-destructive">{result}</p> : <Table data={result as Row[]} />}</div>
        </Panel>
      </div>
    </div>
  );
}
