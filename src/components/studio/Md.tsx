import type { ReactNode } from "react";

/** Inline: `code`, **bold**, *italic*. */
function inline(s: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index));
    const t = m[0];
    const k = `${key}-${i++}`;
    if (t.startsWith("`")) out.push(<code key={k} className="rounded bg-background/70 px-1 py-0.5 font-mono text-[0.85em]">{t.slice(1, -1)}</code>);
    else if (t.startsWith("**")) out.push(<strong key={k}>{t.slice(2, -2)}</strong>);
    else out.push(<em key={k}>{t.slice(1, -1)}</em>);
    last = m.index + t.length;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}

/** Small, safe Markdown for OG BOT's replies: code blocks, lists, headings, inline styles. No HTML. */
export function Md({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  const parts = text.split(/```/);
  parts.forEach((part, pi) => {
    if (pi % 2 === 1) {
      const code = part.replace(/^[\w+-]*\n/, "");
      blocks.push(
        <pre key={`c${pi}`} className="my-2 overflow-x-auto rounded-lg bg-background/80 p-3 font-mono text-[12px] leading-relaxed">
          <code>{code.replace(/\n$/, "")}</code>
        </pre>,
      );
      return;
    }
    let list: { ordered: boolean; items: string[] } | null = null;
    const flush = (k: string) => {
      if (!list) return;
      const L = list;
      blocks.push(
        L.ordered ? (
          <ol key={k} className="my-1 list-decimal space-y-0.5 pl-5">{L.items.map((it, i) => <li key={i}>{inline(it, `${k}${i}`)}</li>)}</ol>
        ) : (
          <ul key={k} className="my-1 list-disc space-y-0.5 pl-5">{L.items.map((it, i) => <li key={i}>{inline(it, `${k}${i}`)}</li>)}</ul>
        ),
      );
      list = null;
    };
    part.split("\n").forEach((line, li) => {
      const k = `p${pi}-${li}`;
      const ul = line.match(/^\s*[-*•]\s+(.*)$/);
      const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
      if (ul || ol) {
        const ordered = !!ol;
        if (list && list.ordered !== ordered) flush(`${k}f`);
        list ??= { ordered, items: [] };
        list.items.push((ul ?? ol)![1]!);
        return;
      }
      flush(`${k}f`);
      const h = line.match(/^#{1,3}\s+(.*)$/);
      if (h) blocks.push(<p key={k} className="mt-2 font-semibold">{inline(h[1]!, k)}</p>);
      else if (line.trim()) blocks.push(<p key={k}>{inline(line, k)}</p>);
    });
    flush(`p${pi}-end`);
  });
  return <div className="space-y-1">{blocks}</div>;
}
