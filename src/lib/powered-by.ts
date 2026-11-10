/**
 * Every site made with OFFLINE FORGE is "Powered by OG BOT": a small badge added to the live
 * preview and to every export. Self-contained (inline styles, no network) so it works offline.
 */
export const POWERED_BY_ID = "og-bot-powered";

export const POWERED_BY_HTML =
  `<a id="${POWERED_BY_ID}" href="https://ogbot.co.uk" target="_blank" rel="noopener" ` +
  `style="position:fixed;right:12px;bottom:12px;z-index:2147483000;display:inline-flex;align-items:center;gap:6px;` +
  `padding:6px 10px;border-radius:999px;background:rgba(10,14,23,.9);border:1px solid rgba(96,165,250,.55);` +
  `color:#e6edf7;font:600 11px/1 system-ui,-apple-system,'Segoe UI',sans-serif;letter-spacing:.04em;` +
  `text-decoration:none;box-shadow:0 0 14px rgba(59,130,246,.45)">&#9889; Powered by ` +
  `<b style="color:#60a5fa;letter-spacing:.08em">OG BOT</b></a>`;

/** Add the badge to a full HTML document (or fragment) once. */
export function withPoweredBy(doc: string): string {
  if (doc.includes(`id="${POWERED_BY_ID}"`)) return doc;
  return /<\/body>/i.test(doc)
    ? doc.replace(/<\/body>(?![\s\S]*<\/body>)/i, () => `${POWERED_BY_HTML}</body>`)
    : doc + POWERED_BY_HTML;
}
