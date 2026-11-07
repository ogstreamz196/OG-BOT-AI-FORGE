import { describe, expect, it } from "vitest";
import { applyTheme, parseTheme, themeCss, DEFAULT_THEME } from "@/lib/brand";

describe("brand theming", () => {
  it("applies a theme block and is idempotent (replaces, not duplicates)", () => {
    const base = "body{margin:0}";
    const once = applyTheme(base, DEFAULT_THEME);
    expect(once).toContain("--og-primary:#3d5afe");
    expect(once).toContain("body{margin:0}");
    const twice = applyTheme(once, { ...DEFAULT_THEME, primary: "#ff0000" });
    expect(twice.match(/\/\* og-theme \*\//g)?.length).toBe(1); // single start marker
    expect(twice).toContain("--og-primary:#ff0000");
    expect(twice).not.toContain("--og-primary:#3d5afe");
  });
  it("round-trips through parseTheme", () => {
    const t = { ...DEFAULT_THEME, primary: "#123456", font: "Georgia, serif" };
    expect(parseTheme(themeCss(t))).toMatchObject({ primary: "#123456", font: "Georgia, serif" });
  });
  it("parseTheme falls back to defaults when absent", () => {
    expect(parseTheme("body{}")).toEqual(DEFAULT_THEME);
  });
});
