import type { Files } from "./workspace";

/** One OG BOT edit, kept on its chat message so it can be reviewed and undone later. */
export type EditRecord = {
  files: Record<string, { before: string; after: string }>;
  added: number;
  removed: number;
};

export type DiffLine = { t: "same" | "add" | "del"; s: string };

/** Line diff (LCS). Big files fall back to a whole-file replace view. */
export function lineDiff(before: string, after: string): DiffLine[] {
  const a = before ? before.split("\n") : [];
  const b = after ? after.split("\n") : [];
  if (a.length * b.length > 400_000) return [...a.map((s) => ({ t: "del" as const, s })), ...b.map((s) => ({ t: "add" as const, s }))];
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--) dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ t: "same", s: a[i]! });
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) out.push({ t: "del", s: a[i++]! });
    else out.push({ t: "add", s: b[j++]! });
  }
  while (i < n) out.push({ t: "del", s: a[i++]! });
  while (j < m) out.push({ t: "add", s: b[j++]! });
  return out;
}

/** Record what a patch changes (only files whose content really changes). */
export function makeEdit(before: Files, patch: Files): EditRecord | null {
  const files: EditRecord["files"] = {};
  let added = 0;
  let removed = 0;
  for (const [name, after] of Object.entries(patch)) {
    const prev = before[name] ?? "";
    if (prev === after) continue;
    files[name] = { before: prev, after };
    for (const l of lineDiff(prev, after)) {
      if (l.t === "add") added++;
      else if (l.t === "del") removed++;
    }
  }
  return Object.keys(files).length ? { files, added, removed } : null;
}

/** Only the changed lines with a little context, for the chat card. */
export function diffHunks(d: DiffLine[], context = 2): (DiffLine | { t: "gap"; s: string })[] {
  const keep = d.map((l, i) => l.t !== "same" || d.slice(Math.max(0, i - context), i + context + 1).some((x) => x.t !== "same"));
  const out: (DiffLine | { t: "gap"; s: string })[] = [];
  let skipped = 0;
  d.forEach((l, i) => {
    if (keep[i]) {
      if (skipped) out.push({ t: "gap", s: `… ${skipped} unchanged line${skipped > 1 ? "s" : ""}` });
      skipped = 0;
      out.push(l);
    } else skipped++;
  });
  if (skipped) out.push({ t: "gap", s: `… ${skipped} unchanged line${skipped > 1 ? "s" : ""}` });
  return out;
}

/** Files to write to undo an edit, and whether something changed them since. */
export function undoPatch(edit: EditRecord, current: Files): { patch: Files; changedSince: string[] } {
  const patch: Files = {};
  const changedSince: string[] = [];
  for (const [name, { before, after }] of Object.entries(edit.files)) {
    patch[name] = before;
    if ((current[name] ?? "") !== after) changedSince.push(name);
  }
  return { patch, changedSince };
}

/** Keep chat storage small: drop file contents from all but the newest `keep` edits. */
export function trimEdits<T extends { edit?: EditRecord; editTrimmed?: boolean }>(msgs: T[], keep = 15): T[] {
  let seen = 0;
  return [...msgs]
    .reverse()
    .map((m) => {
      if (!m.edit) return m;
      seen++;
      if (seen <= keep) return m;
      const { edit: _e, ...rest } = m;
      return { ...rest, editTrimmed: true } as T;
    })
    .reverse();
}
