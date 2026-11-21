import { buildDoc, type Files } from "./workspace";

/**
 * Check a built site the way a developer would before saying "done": read the code for
 * mistakes, then run it in a hidden sandbox and catch errors. Used by the Build chat so
 * OG BOT can fix its own mistakes before you see them.
 */

export type Issue = { kind: "syntax" | "runtime" | "missing" | "structure"; text: string };

const ids = (html: string) => new Set([...html.matchAll(/\bid\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]!));

/** Problems you can see by reading the files (no running needed). */
export function staticIssues(files: Files): Issue[] {
  const out: Issue[] = [];
  const html = files["index.html"] ?? "";
  const css = files["styles.css"] ?? "";
  const js = files["app.js"] ?? "";
  if (!html.trim()) out.push({ kind: "structure", text: "index.html is empty, so the page shows nothing." });

  // JavaScript that doesn't even parse.
  if (js.trim()) {
    try {
      new Function(js);
    } catch (e) {
      out.push({ kind: "syntax", text: `app.js has a syntax error: ${e instanceof Error ? e.message : String(e)}` });
    }
  }
  // Inline scripts in the HTML too.
  for (const m of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)) {
    const code = m[1] ?? "";
    if (!code.trim()) continue;
    try {
      new Function(code);
    } catch (e) {
      out.push({ kind: "syntax", text: `A <script> in index.html has a syntax error: ${e instanceof Error ? e.message : String(e)}` });
    }
  }

  // Code looking for elements that don't exist.
  const have = ids(html);
  const wanted = new Set<string>();
  for (const m of js.matchAll(/getElementById\(\s*["'`]([\w-]+)["'`]\s*\)/g)) wanted.add(m[1]!);
  for (const m of js.matchAll(/querySelector(?:All)?\(\s*["'`]#([\w-]+)["'`]\s*\)/g)) wanted.add(m[1]!);
  for (const id of wanted) if (!have.has(id)) out.push({ kind: "missing", text: `app.js uses #${id}, but index.html has no element with id="${id}".` });

  // CSS braces.
  const open = (css.match(/{/g) ?? []).length;
  const close = (css.match(/}/g) ?? []).length;
  if (open !== close) out.push({ kind: "syntax", text: `styles.css has ${open} "{" but ${close} "}": a rule isn't closed.` });

  // Unbalanced main tags.
  for (const tag of ["div", "section", "main", "header", "footer", "nav", "form", "ul"]) {
    const o = (html.match(new RegExp(`<${tag}\\b`, "gi")) ?? []).length;
    const c = (html.match(new RegExp(`</${tag}>`, "gi")) ?? []).length;
    if (o !== c) out.push({ kind: "structure", text: `index.html opens <${tag}> ${o} time(s) but closes it ${c} time(s).` });
  }
  return out;
}

/** Run the site in a hidden, sandboxed frame and collect errors it throws while loading. */
export function runtimeIssues(files: Files, timeoutMs = 2500): Promise<Issue[]> {
  if (typeof document === "undefined") return Promise.resolve([]);
  return new Promise((resolve) => {
    const token = `og-check-${Math.random().toString(36).slice(2)}`;
    const probe = `<script>(function(){var e=[],t=${JSON.stringify(token)};function s(){parent.postMessage({ogCheck:t,errors:e},"*")}
window.addEventListener("error",function(x){e.push((x.message||"error")+(x.lineno?" (line "+x.lineno+")":""))});
window.addEventListener("unhandledrejection",function(x){e.push("Unhandled promise: "+(x.reason&&x.reason.message||x.reason))});
var ce=console.error;console.error=function(){e.push(Array.prototype.join.call(arguments," "));ce.apply(console,arguments)};
window.addEventListener("load",function(){setTimeout(s,400)})})();</script>`;
    const doc = buildDoc(files).replace(/<head[^>]*>/i, (h) => `${h}${probe}`);
    const frame = document.createElement("iframe");
    frame.setAttribute("sandbox", "allow-scripts");
    frame.setAttribute("aria-hidden", "true");
    frame.tabIndex = -1;
    frame.style.cssText = "position:fixed;left:-10000px;top:0;width:1024px;height:768px;opacity:0;pointer-events:none";
    let done = false;
    const finish = (errors: string[]) => {
      if (done) return;
      done = true;
      window.removeEventListener("message", onMsg);
      frame.remove();
      resolve([...new Set(errors)].slice(0, 8).map((text) => ({ kind: "runtime" as const, text })));
    };
    const onMsg = (e: MessageEvent) => {
      const d = e.data as { ogCheck?: string; errors?: string[] } | null;
      if (d?.ogCheck === token) finish(d.errors ?? []);
    };
    window.addEventListener("message", onMsg);
    setTimeout(() => finish([]), timeoutMs);
    frame.srcdoc = doc;
    document.body.appendChild(frame);
  });
}

/** Everything wrong with the site, static problems first. */
export async function checkSite(files: Files): Promise<Issue[]> {
  const s = staticIssues(files);
  const r = await runtimeIssues(files);
  return [...s, ...r];
}

/** The follow-up request that asks the model to fix what the check found. */
export function fixRequest(issues: Issue[], original: string): string {
  return `Your last change ("${original.slice(0, 200)}") left these problems. Fix all of them and keep everything else the same:\n${issues.map((i, n) => `${n + 1}. ${i.text}`).join("\n")}`;
}
