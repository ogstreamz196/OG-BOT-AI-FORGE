/**
 * Brand theming: the generated sites use CSS custom properties (--og-primary,
 * --og-accent, --og-bg, --og-text, --og-muted, --og-font) with sensible
 * fallbacks, so a site looks right with no theme block at all. The Theme & Brand
 * panel writes a single marked `:root` block into styles.css; editing it
 * recolors every section live and ships in the export. Pure + testable.
 */

export type Theme = {
  primary: string;
  accent: string;
  bg: string;
  text: string;
  muted: string;
  font: string;
};

export const DEFAULT_THEME: Theme = {
  primary: "#3d5afe",
  accent: "#00f59b",
  bg: "#0b0f1e",
  text: "#ffffff",
  muted: "#9aa4c4",
  font: "Inter, system-ui, sans-serif",
};

export const FONT_OPTIONS: { label: string; value: string }[] = [
  { label: "Inter / System", value: "Inter, system-ui, sans-serif" },
  { label: "Serif (Georgia)", value: "Georgia, 'Times New Roman', serif" },
  { label: "Monospace", value: "'JetBrains Mono', ui-monospace, monospace" },
  { label: "Rounded (Trebuchet)", value: "'Trebuchet MS', 'Segoe UI', sans-serif" },
  { label: "Classic (Helvetica)", value: "Helvetica, Arial, sans-serif" },
];

const START = "/* og-theme */";
const END = "/* /og-theme */";

export function themeCss(theme: Theme): string {
  return `${START}
:root{--og-primary:${theme.primary};--og-accent:${theme.accent};--og-bg:${theme.bg};--og-text:${theme.text};--og-muted:${theme.muted};--og-font:${theme.font}}
body{background:var(--og-bg);color:var(--og-text);font-family:var(--og-font)}
${END}`;
}

/** Insert or replace the theme block in a stylesheet. */
export function applyTheme(css: string, theme: Theme): string {
  const block = themeCss(theme);
  const s = css.indexOf(START);
  const e = css.indexOf(END);
  if (s !== -1 && e !== -1 && e > s) {
    return css.slice(0, s) + block + css.slice(e + END.length);
  }
  return `${block}\n${css}`;
}

/** Read the current theme from a stylesheet, falling back to defaults. */
export function parseTheme(css: string): Theme {
  const get = (name: keyof Theme, varName: string) => {
    const m = css.match(new RegExp(`--og-${varName}:\\s*([^;}]+)`));
    return m ? m[1]!.trim() : DEFAULT_THEME[name];
  };
  return {
    primary: get("primary", "primary"),
    accent: get("accent", "accent"),
    bg: get("bg", "bg"),
    text: get("text", "text"),
    muted: get("muted", "muted"),
    font: get("font", "font"),
  };
}
