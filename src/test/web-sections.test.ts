import { describe, expect, it } from "vitest";
import { insertSection, resolveSection, SECTIONS } from "@/lib/web-sections";
import { planEdit } from "@/lib/agent-edits";
import { BLANK, TEMPLATES } from "@/lib/workspace";

describe("resolveSection", () => {
  it("matches common phrasings and prefers the longest keyword", () => {
    expect(resolveSection("hero")?.id).toBe("hero");
    expect(resolveSection("pricing table")?.id).toBe("pricing");
    expect(resolveSection("a contact form")?.id).toBe("contact");
    expect(resolveSection("nothing relevant")).toBeNull();
  });
});

describe("insertSection", () => {
  it("inserts before </body> in a full doc and dedupes CSS", () => {
    const hero = SECTIONS.find((s) => s.id === "hero")!;
    const files = { "index.html": "<html><body><p>x</p></body></html>", "styles.css": "" };
    const once = insertSection(files, hero);
    expect(once["index.html"]).toMatch(/og-hero[\s\S]*<\/body>/);
    expect(once["styles.css"]).toContain("og-sections-base");
    const twice = insertSection(once, hero);
    // base + section CSS markers appear once
    expect(twice["styles.css"]!.match(/og-sec:hero/g)?.length).toBe(1);
  });
});

describe("planEdit section commands", () => {
  it("adds sections via natural language", () => {
    for (const [phrase, id] of [
      ["add a hero", "og-hero"],
      ["insert a pricing table", "og-price"],
      ["add contact form", "og-form"],
    ] as const) {
      const r = planEdit(BLANK, phrase);
      expect(r.ok, phrase).toBe(true);
      expect(r.patch["index.html"], phrase).toContain(id);
    }
  });
  it("still leaves a TODO for unknown adds", () => {
    expect(planEdit(BLANK, "add a login screen").ok).toBe(false);
  });
});

describe("web templates", () => {
  it("landing-page template is composed from sections", () => {
    const t = TEMPLATES["landing-page"]!;
    expect(t["index.html"]).toMatch(/og-hero/);
    expect(t["index.html"]).toMatch(/id="pricing"/);
    expect(t["index.html"]).toMatch(/og-footer/);
  });
});
