import { useState } from "react";
import { Palette, RotateCcw } from "lucide-react";
import { Panel, Btn } from "./ui";
import { useWorkspace, workspace } from "@/lib/workspace";
import { applyTheme, parseTheme, DEFAULT_THEME, FONT_OPTIONS, type Theme } from "@/lib/brand";
import { usage } from "@/lib/usage";

const SWATCHES: { key: keyof Theme; label: string }[] = [
  { key: "primary", label: "Primary / buttons" },
  { key: "accent", label: "Accent / highlights" },
  { key: "bg", label: "Background" },
  { key: "text", label: "Text" },
  { key: "muted", label: "Muted text" },
];

const PRESETS: { name: string; theme: Partial<Theme> }[] = [
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
          <label className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2 sm:col-span-2">
            <span className="text-sm text-foreground">Font</span>
            <select
              aria-label="Font"
              value={theme.font}
              onChange={(e) => setKey("font", e.target.value)}
              className="rounded border border-input bg-background px-2 py-1 text-xs text-foreground outline-none focus:border-primary"
            >
              {FONT_OPTIONS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </Panel>
    </div>
  );
}
