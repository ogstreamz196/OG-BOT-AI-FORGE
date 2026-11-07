/**
 * Section blocks: inserted sections are wrapped in HTML comment markers
 * (<!-- og:start:ID --> … <!-- og:end:ID -->) so they can be listed, reordered,
 * duplicated and removed reliably in the raw index.html string. Pure + tested.
 */

export type Block = { id: string; full: string; start: number; end: number };

const RE = /<!-- og:start:([\w-]+) -->[\s\S]*?<!-- og:end:\1 -->/g;

export function wrapBlock(id: string, html: string): string {
  return `<!-- og:start:${id} -->\n${html}\n<!-- og:end:${id} -->`;
}

export function parseBlocks(html: string): Block[] {
  const blocks: Block[] = [];
  RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = RE.exec(html))) {
    blocks.push({ id: m[1]!, full: m[0], start: m.index, end: m.index + m[0].length });
  }
  return blocks;
}

/** Swap block at index i with the one before it (move up) or after it (move down). */
export function moveBlock(html: string, index: number, dir: "up" | "down"): string {
  const blocks = parseBlocks(html);
  const j = dir === "up" ? index - 1 : index + 1;
  if (index < 0 || index >= blocks.length || j < 0 || j >= blocks.length) return html;
  const a = blocks[Math.min(index, j)]!;
  const b = blocks[Math.max(index, j)]!;
  return html.slice(0, a.start) + b.full + html.slice(a.end, b.start) + a.full + html.slice(b.end);
}

export function removeBlock(html: string, index: number): string {
  const blocks = parseBlocks(html);
  const blk = blocks[index];
  if (!blk) return html;
  const before = html.slice(0, blk.start).replace(/\n\s*$/, "");
  const after = html.slice(blk.end).replace(/^\s*\n/, "");
  return `${before}\n${after}`;
}

export function duplicateBlock(html: string, index: number): string {
  const blocks = parseBlocks(html);
  const blk = blocks[index];
  if (!blk) return html;
  return `${html.slice(0, blk.end)}\n${blk.full}${html.slice(blk.end)}`;
}
