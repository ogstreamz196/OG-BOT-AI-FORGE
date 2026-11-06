import type { Files } from "./workspace";
import { insertSection, resolveSection } from "./web-sections";

/**
 * Deterministic, offline edit engine behind the Agent's `/edit` command.
 * Parses `/edit [file] <instruction>` and returns the file patch to apply plus
 * a log of what it did. Pure, so it is unit-testable and safe to run anywhere.
 *
 * Supported instructions:
 *   dark mode / dark mode toggle         add a persisted light/dark toggle
 *   title <text> | heading <text>         set the first <h1> (and <title>)
 *   background <css-color>                set the page background
 *   accent <css-color>                    set button/link accent colour
 *   replace "<a>" with "<b>"              literal replace in the target file(s)
 *   append <code>                         append code to the target file
 * Anything else leaves a TODO comment in the target file.
 */
export type EditResult = { patch: Files; log: string[]; ok: boolean };

const DARK_MARK = "og-dark-toggle";

const comment = (file: string, text: string) => {
  const safe = text.replace(/\*\//g, "* /").replace(/-->/g, "-- >");
  if (file.endsWith(".html")) return `<!-- ${safe} -->`;
  return `/* ${safe} */`;
};

function diffStat(before: string, after: string) {
  const a = before.split("\n").length;
  const b = after.split("\n").length;
  return b >= a ? `(+${b - a || 1} −0)` : `(+0 −${a - b})`;
}

export function planEdit(files: Files, args: string): EditResult {
  const input = args.trim();
  if (!input) return { patch: {}, log: ["Usage: /edit [file] <instruction>"], ok: false };

  const first = input.split(/\s+/)[0] ?? "";
  const explicit = first in files ? first : null;
  const instruction = explicit ? input.slice(first.length).trim() : input;
  const target = explicit ?? "index.html";
  const lower = instruction.toLowerCase();
  const patch: Files = {};
  const log: string[] = [`Planning edit: ${instruction || "(no instruction)"}`];
  const cur = (f: string) => patch[f] ?? files[f] ?? "";
  const write = (f: string, next: string) => {
    log.push(`Patching ${f} ${diffStat(cur(f), next)}`);
    patch[f] = next;
  };

  if (!instruction) return { patch: {}, log: [...log, "Nothing to do."], ok: false };

  // dark mode toggle
  if (/dark\s*mode/.test(lower)) {
    if (Object.values(files).some((c) => c.includes(DARK_MARK))) {
      return {
        patch: {},
        log: [...log, "Dark mode toggle already present — no changes."],
        ok: true,
      };
    }
    write(
      "styles.css",
      `${cur("styles.css")}\n/* ${DARK_MARK} */\nbody.og-light{background:#f5f7fb !important;color:#0b0f1e !important}\n#${DARK_MARK}{position:fixed;right:12px;bottom:12px;z-index:9999;padding:8px 12px;border-radius:999px;border:1px solid #3b82f6;background:#0a0e17;color:#00f59b;font:600 12px monospace;cursor:pointer}\n`,
    );
    write(
      "app.js",
      `${cur("app.js")}\n// ${DARK_MARK}\n(function(){var b=document.createElement("button");b.id="${DARK_MARK}";var k="og-theme";var apply=function(l){document.body.classList.toggle("og-light",l);b.textContent=l?"☾ Dark":"☀ Light"};var saved=false;try{saved=localStorage.getItem(k)==="light"}catch(e){}apply(saved);b.onclick=function(){var l=!document.body.classList.contains("og-light");apply(l);try{localStorage.setItem(k,l?"light":"dark")}catch(e){}};document.body.appendChild(b)})();\n`,
    );
    log.push("Edit applied.");
    return { patch, log, ok: true };
  }

  // title / heading
  const title = instruction.match(
    /^(?:please\s+)?(?:set|change|make|update|rename|edit)?\s*(?:the\s+)?(?:title|heading|header|h1)\b\s*(?:to|=|:|as)?\s*["']?(.+?)["']?$/i,
  );
  if (title) {
    const text = title[1]!.replace(/</g, "&lt;");
    const html = cur("index.html");
    let next = html;
    if (/<h1[^>]*>[\s\S]*?<\/h1>/i.test(next))
      next = next.replace(/(<h1[^>]*>)[\s\S]*?(<\/h1>)/i, (_m, a, b) => `${a}${text}${b}`);
    else if (/<body[^>]*>/i.test(next))
      // Full document: insert the heading just inside <body>, never before <!doctype>.
      next = next.replace(/(<body[^>]*>)/i, (m) => `${m}\n<h1>${text}</h1>`);
    else next = `<h1>${text}</h1>\n${next}`;
    if (/<title>[\s\S]*?<\/title>/i.test(next))
      next = next.replace(/<title>[\s\S]*?<\/title>/i, () => `<title>${text}</title>`);
    write("index.html", next);
    log.push("Edit applied.");
    return { patch, log, ok: true };
  }

  // background / accent colours
  const color = instruction.match(
    /^(?:set|change|make|update)?\s*(?:the\s+)?(background|bg|accent)\s*(?:colou?r)?\s*(?:to|=|:)?\s*([#\w(),.%\s-]+)$/i,
  );
  if (color) {
    const value = color[2]!.trim();
    const rule = /accent/i.test(color[1]!)
      ? `button,a{background:${value} !important;border-color:${value} !important}`
      : `body{background:${value} !important}`;
    write("styles.css", `${cur("styles.css")}\n${rule}\n`);
    log.push("Edit applied.");
    return { patch, log, ok: true };
  }

  // replace "a" with "b"
  const rep = instruction.match(/^replace\s+(["'`])([\s\S]+?)\1\s+with\s+(["'`])([\s\S]*?)\3$/i);
  if (rep) {
    const [, , from, , to] = rep as unknown as [string, string, string, string, string];
    const scope = explicit ? [explicit] : Object.keys(files);
    let hits = 0;
    for (const f of scope) {
      const c = cur(f);
      const n = c.split(from).length - 1;
      if (n) {
        hits += n;
        write(f, c.split(from).join(to));
      }
    }
    if (!hits) return { patch: {}, log: [...log, `No occurrences of "${from}" found.`], ok: false };
    log.push(`Replaced ${hits} occurrence${hits === 1 ? "" : "s"}. Edit applied.`);
    return { patch, log, ok: true };
  }

  // add a website section: "add a hero", "insert a pricing table", "add contact form"
  const add = instruction.match(
    /^(?:add|insert|include|create|put|drop)\s+(?:in\s+|a\s+|an\s+|the\s+)*(.+)$/i,
  );
  if (add) {
    const section = resolveSection(add[1]!);
    if (section) {
      const sectionPatch = insertSection(
        { "index.html": cur("index.html"), "styles.css": cur("styles.css") },
        section,
      );
      write("index.html", sectionPatch["index.html"]!);
      write("styles.css", sectionPatch["styles.css"]!);
      log.push(`Added ${section.label} section. Edit applied.`);
      return { patch, log, ok: true };
    }
  }

  // append code
  const app = instruction.match(/^append\s+([\s\S]+)$/i);
  if (app) {
    write(target, `${cur(target)}\n${app[1]}\n`);
    log.push("Edit applied.");
    return { patch, log, ok: true };
  }

  write(target, `${cur(target)}\n${comment(target, `TODO(agent): ${instruction}`)}\n`);
  log.push("No offline rule matched — left a TODO note for you.");
  return { patch, log, ok: false };
}
