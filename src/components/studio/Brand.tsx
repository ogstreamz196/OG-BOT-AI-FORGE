import { useState } from "react";
import { Palette, RotateCcw } from "lucide-react";
import { Panel, Btn } from "./ui";
import { useWorkspace, workspace } from "@/lib/workspace";
import { applyTheme, parseTheme, DEFAULT_THEME, FONT_OPTIONS, type Theme } from "@/lib/brand";
import { usage } from "@/lib/usage";
import { cn } from "@/lib/utils";

const SWATCHES: { key: keyof Theme; label: string }[] = [
  { key: "primary", label: "Primary / buttons" },
  { key: "accent", label: "Accent / highlights" },
  { key: "bg", label: "Background" },
  { key: "text", label: "Text" },
  { key: "muted", label: "Muted text" },
];

const PRESETS: { name: string; theme: Partial<Theme> }[] = [
  {
    name: "OG BOT",
    theme: {
      primary: "#5b47e0",
      accent: "#a77bff",
      bg: "#0b0d1f",
      text: "#f1f3ff",
      muted: "#9a9ec2",
    },
  },
  {
    name: "OG Cyber",
    theme: {
      primary: "#3d5afe",
      accent: "#00f59b",
      bg: "#0b0f1e",
      text: "#ffffff",
      muted: "#9aa4c4",
    },
  },
  {
    name: "Royal",
    theme: {
      primary: "#6d5efc",
      accent: "#22d3ee",
      bg: "#0e1020",
      text: "#ffffff",
      muted: "#a5a8c4",
    },
  },
  {
    name: "Ember",
    theme: {
      primary: "#ef4444",
      accent: "#f59e0b",
      bg: "#140b0b",
      text: "#fff7f2",
      muted: "#c9a79a",
    },
  },
  {
    name: "Mint Light",
    theme: {
      primary: "#0ea5a0",
      accent: "#3d5afe",
      bg: "#f5f7fb",
      text: "#0b0f1e",
      muted: "#5b647e",
    },
  },
  {
    name: "Mono",
    theme: {
      primary: "#111827",
      accent: "#6b7280",
      bg: "#ffffff",
      text: "#111827",
      muted: "#6b7280",
    },
  },
];

export function Brand() {
  const ws = useWorkspace();
  const current = parseTheme(ws.files["styles.css"] ?? "");
  const [theme, setTheme] = useState<Theme>(current);

  const commit = (next: Theme) => {
    setTheme(next);
    workspace.writeFile("styles.css", applyTheme(workspace.get().files["styles.css"] ?? "", next));
    usage.record("edits");
  };
  const setKey = (key: keyof Theme, value: string) => commit({ ...theme, [key]: value });

  return (
    <div className="space-y-3">
      <Panel
        title="Theme & Brand"
        right={
          <Btn variant="ghost" onClick={() => commit(DEFAULT_THEME)}>
            <RotateCcw className="mr-1 inline h-3 w-3" />
            Reset
          </Btn>
        }
      >
        <p className="mb-3 text-xs text-muted-foreground">
          <Palette className="mr-1 inline h-3 w-3 text-primary" />
          Set your brand colours and font. They apply across every section of{" "}
          <span className="font-mono text-foreground">{ws.project}</span> and ship with the export.
        </p>

        <div className="mb-4 flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.name}
              onClick={() => commit({ ...theme, ...p.theme })}
              className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs text-foreground transition hover:border-primary"
            >
              <span className="flex -space-x-1">
                {[p.theme.primary, p.theme.accent, p.theme.bg].map((c, i) => (
                  <span
                    key={i}
                    className="h-4 w-4 rounded-full border border-white/20"
                    style={{ background: c }}
                  />
                ))}
              </span>
              {p.name}
            </button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {SWATCHES.map(({ key, label }) => (
            <label
              key={key}
              className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2"
            >
              <span className="text-sm text-foreground">{label}</span>
              <span className="flex items-center gap-2">
                <input
                  type="color"
                  aria-label={label}
                  value={/^#[0-9a-fA-F]{6}$/.test(theme[key]) ? theme[key] : "#000000"}
                  onChange={(e) => setKey(key, e.target.value)}
                  className="h-7 w-10 cursor-pointer rounded border border-border bg-transparent"
                />
                <input
                  value={theme[key]}
                  onChange={(e) => setKey(key, e.target.value)}
                  className="w-24 rounded border border-input bg-background px-2 py-1 font-mono text-[11px] text-foreground outline-none focus:border-primary"
                />
              </span>
            </label>
          ))}
          <fieldset className="rounded-lg border border-border bg-card px-3 py-2 sm:col-span-2">
            <legend className="px-1 text-sm text-foreground">Font</legend>
            <div
              role="radiogroup"
              aria-label="Font"
              className="grid grid-cols-2 gap-2 sm:grid-cols-5"
            >
              {FONT_OPTIONS.map((f) => (
                <button
                  key={f.value}
                  role="radio"
                  aria-checked={theme.font === f.value}
                  onClick={() => setKey("font", f.value)}
                  className={cn(
                    "rounded-lg border px-2 py-2 text-left transition",
                    theme.font === f.value
                      ? "border-primary bg-primary/10"
                      : "border-border hover:border-primary/60",
                  )}
                >
                  <span
                    className="block text-lg leading-none text-foreground"
                    style={{ fontFamily: f.value }}
                  >
                    Aa
                  </span>
                  <span className="mt-1 block truncate text-[11px] text-muted-foreground">
                    {f.label}
                  </span>
                </button>
              ))}
            </div>
          </fieldset>
        </div>
      </Panel>

      <Panel title="Live sample">
        <div
          aria-label="Theme sample"
          className="overflow-hidden rounded-xl border border-border"
          style={{ background: theme.bg, color: theme.text, fontFamily: theme.font }}
        >
          <div
            className="flex items-center justify-between px-5 py-3"
            style={{ borderBottom: `1px solid ${theme.muted}33` }}
          >
            <span className="font-bold">{ws.project}</span>
            <span className="flex gap-4 text-sm" style={{ color: theme.muted }}>
              <span>Features</span>
              <span>Pricing</span>
              <span style={{ color: theme.accent }}>Contact</span>
            </span>
          </div>
          <div className="px-5 py-8">
            <h3 className="text-2xl font-bold">Build something great</h3>
            <p className="mt-2 max-w-md text-sm" style={{ color: theme.muted }}>
              This is how your site's headings, text, buttons and highlights look with these
              colours.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <span
                className="rounded-lg px-4 py-2 text-sm font-semibold"
                style={{ background: theme.primary, color: "#fff" }}
              >
                Start free
              </span>
              <span
                className="rounded-lg border px-4 py-2 text-sm font-semibold"
                style={{ borderColor: theme.primary, color: theme.accent }}
              >
                Learn more
              </span>
            </div>
          </div>
        </div>
      </Panel>
    </div>
  );
}
