import { withPoweredBy } from "./powered-by";

/**
 * Dev Workbench engine — pure helpers (tested). Zero-compromise local coding:
 * qwen2.5-coder:14b is the default everywhere (docked on the RTX 5080, or in RAM on the
 * Ryzen AI 9 when portable); deepseek-r1:14b for reasoning; dolphin3:8b for automation.
 */

export const DEV_SUITE = [
  { tag: "qwen2.5-coder:14b", role: "Full-Stack Code Architect (default)" },
  { tag: "deepseek-r1:14b", role: "Architectural Reasoning & Bug Hunt" },
  { tag: "dolphin3:8b", role: "Uncensored Code / Pentest / Shell Automation" },
  { tag: "mistral-nemo:12b", role: "Strict JSON API & Config Builder" },
  { tag: "qwen2.5:14b", role: "Lyrical / Prompt Engineering Director" },
  { tag: "llama3.2:3b", role: "Lightweight Syntax Check / Instant Ping" },
] as const;
export const DEFAULT_CODER = "qwen2.5-coder:14b";

export type DevMode = "refactor" | "fullstack" | "automation";
export const DEV_MODES: Record<
  DevMode,
  { label: string; model: string; hint: string; system: string }
> = {
  refactor: {
    label: "Refactor & Debug",
    model: "deepseek-r1:14b",
    hint: "Paste code in the editor, describe the bug or the refactor you want.",
    system:
      "You are a senior engineer doing a careful review. Find root causes and edge cases, then give the corrected code. " +
      "Explain briefly, then output every changed file in full as:\n### `path/file.ext`\n```lang\n...\n```",
  },
  fullstack: {
    label: "Full-Stack Generator",
    model: "qwen2.5-coder:14b",
    hint: "Describe the app or feature; files stream into their own tabs.",
    system:
      "You are an expert full-stack engineer. Produce complete, working, production-quality code with no placeholders. " +
      "Output each file in full, one after another, exactly as:\n### `path/file.ext`\n```lang\n...\n```\n" +
      "Use sensible file names (e.g. src/App.tsx, schema.sql, api_proxy.ts). Keep prose to one short line per file.",
  },
  automation: {
    label: "Unrestricted Automation",
    model: "dolphin3:8b",
    hint: "Shell, PowerShell, batch or Python automation for your own machines.",
    system:
      "You are a systems automation expert writing scripts for the user's own Windows machines and drive. " +
      "Answer directly with working scripts. Output each script in full as:\n### `name.ext`\n```lang\n...\n```",
  },
};

/** Split DeepSeek-R1's <think> chain from the answer (works mid-stream, before </think> arrives). */
export function splitThink(text: string): { think: string; answer: string; thinking: boolean } {
  const open = text.indexOf("<think>");
  if (open === -1) return { think: "", answer: text, thinking: false };
  const close = text.indexOf("</think>", open);
  if (close === -1)
    return { think: text.slice(open + 7).trim(), answer: text.slice(0, open), thinking: true };
  return {
    think: text.slice(open + 7, close).trim(),
    answer: (text.slice(0, open) + text.slice(close + 8)).trim(),
    thinking: false,
  };
}

export type GenFile = { name: string; lang: string; content: string; complete: boolean };

const EXT_LANG: Record<string, string> = {
  ts: "typescript",
  tsx: "tsx",
  js: "javascript",
  jsx: "jsx",
  mjs: "javascript",
  py: "python",
  sql: "sql",
  json: "json",
  html: "html",
  css: "css",
  md: "markdown",
  sh: "bash",
  bat: "bat",
  cmd: "bat",
  ps1: "powershell",
  yml: "yaml",
  yaml: "yaml",
  toml: "toml",
};
const LANG_EXT: Record<string, string> = {
  typescript: "ts",
  ts: "ts",
  tsx: "tsx",
  javascript: "js",
  js: "js",
  jsx: "jsx",
  python: "py",
  py: "py",
  sql: "sql",
  json: "json",
  html: "html",
  css: "css",
  bash: "sh",
  sh: "sh",
  shell: "sh",
  powershell: "ps1",
  ps1: "ps1",
  bat: "bat",
  batch: "bat",
  cmd: "bat",
  yaml: "yml",
  markdown: "md",
};
export const langFor = (name: string) =>
  EXT_LANG[name.split(".").pop()?.toLowerCase() ?? ""] ?? "text";

/**
 * Pull files out of a (possibly still streaming) answer. A file name comes from a heading/line
 * just before the fence (`### \`App.tsx\``, `File: App.tsx`) or the fence info (```tsx App.tsx).
 * The last, unterminated fence is returned with complete=false so tabs fill live.
 */
export function parseFiles(text: string): GenFile[] {
  const files: GenFile[] = [];
  const re = /```([^\n`]*)\n([\s\S]*?)(```|$)/g;
  let m: RegExpExecArray | null;
  let unnamed = 0;
  while ((m = re.exec(text))) {
    const info = m[1]!.trim();
    const before =
      text
        .slice(Math.max(0, m.index - 200), m.index)
        .split("\n")
        .filter((l) => l.trim())
        .pop() ?? "";
    const fromInfo = info
      .split(/\s+/)
      .slice(1)
      .join(" ")
      .replace(/^(title|file(name)?)=/i, "")
      .replace(/["']/g, "");
    const fromHeading =
      before.match(/`([^`\s]+\.[A-Za-z0-9]+)`/)?.[1] ??
      before.match(/(?:file|filename)\s*:\s*([^\s`*]+\.[A-Za-z0-9]+)/i)?.[1] ??
      before.match(/^#{1,6}\s+([^\s`*]+\.[A-Za-z0-9]+)\s*$/)?.[1];
    const lang = info.split(/\s+/)[0]?.toLowerCase() ?? "";
    const name =
      (fromInfo && /\.[A-Za-z0-9]+$/.test(fromInfo) ? fromInfo : fromHeading) ||
      `snippet-${++unnamed}.${LANG_EXT[lang] ?? "txt"}`;
    const complete = m[3] === "```";
    const content = m[2]!.replace(/\n$/, "");
    const existing = files.findIndex((f) => f.name === name);
    const file = { name, lang: lang || langFor(name), content, complete };
    if (existing >= 0) files[existing] = file;
    else files.push(file);
    if (!complete) break;
  }
  return files;
}

/** Can these files be shown as a live web preview? */
export function previewable(files: { name: string }[]): boolean {
  return files.some((f) => /\.html?$/i.test(f.name));
}

/** Combine html + css + js into one document for the live preview iframe. */
export function previewDoc(files: { name: string; content: string }[]): string {
  const html =
    files.find((f) => /index\.html?$/i.test(f.name)) ?? files.find((f) => /\.html?$/i.test(f.name));
  if (!html) return "";
  const css = files
    .filter((f) => /\.css$/i.test(f.name))
    .map((f) => f.content)
    .join("\n");
  const js = files
    .filter((f) => /\.(m?js)$/i.test(f.name))
    .map((f) => f.content)
    .join("\n;\n");
  const doc = /<html/i.test(html.content)
    ? html.content
    : `<!doctype html><html><head><meta charset="utf-8"></head><body>${html.content}</body></html>`;
  const withCss = withPoweredBy(
    css ? doc.replace(/<\/head>/i, `<style>${css}</style></head>`) : doc,
  );
  return js
    ? withCss.replace(
        /<\/body>/i,
        `<script>${js.replace(/<\/script/gi, "<\\/script")}</script></body>`,
      )
    : withCss;
}

const b64 = (s: string) => {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
};

/**
 * A Windows .bat that writes every file to disk (exact bytes, via certutil base64), keeping
 * folders. If there's exactly one runnable script it offers to run it (asks first, default No).
 */
export function restoreBatch(
  files: { name: string; content: string }[],
  project = "og-bot-workbench",
): string {
  const safe = (n: string) =>
    n
      .replace(/[<>:"|?*]/g, "_")
      .replace(/\.\.+/g, ".")
      .replace(/^[\\/]+/, "")
      .replace(/\//g, "\\");
  const L = [
    "@echo off",
    `REM Generated by the OG-BOT Dev Workbench: writes ${files.length} file(s) into .\\${project}`,
    "setlocal",
    `if not exist "${project}" mkdir "${project}"`,
    `cd /d "${project}"`,
  ];
  for (const f of files) {
    const path = safe(f.name);
    const dir = path.includes("\\") ? path.slice(0, path.lastIndexOf("\\")) : "";
    if (dir) L.push(`if not exist "${dir}" mkdir "${dir}"`);
    L.push(`del "%TEMP%\\ogbot.b64" 2>nul`);
    for (const chunk of b64(f.content).match(/.{1,76}/g) ?? [""])
      L.push(`>>"%TEMP%\\ogbot.b64" echo ${chunk}`);
    L.push(`certutil -f -decode "%TEMP%\\ogbot.b64" "${path}" >nul`, `echo   wrote ${path}`);
  }
  L.push(`del "%TEMP%\\ogbot.b64" 2>nul`);
  const runnable = files.filter((f) => /\.(bat|cmd|ps1|py)$/i.test(f.name));
  if (runnable.length === 1) {
    const p = safe(runnable[0]!.name);
    const cmd = /\.ps1$/i.test(p)
      ? `powershell -NoProfile -ExecutionPolicy Bypass -File "${p}"`
      : /\.py$/i.test(p)
        ? `python "${p}"`
        : `call "${p}"`;
    L.push(
      `choice /c YN /n /t 15 /d N /m "Run ${p} now? [Y/N] "`,
      "if errorlevel 2 goto end",
      cmd,
      ":end",
    );
  }
  L.push("echo Done.", "pause");
  return L.join("\r\n");
}
