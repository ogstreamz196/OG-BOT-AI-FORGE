import { describe, expect, it } from "vitest";
import { planEdit } from "@/lib/agent-edits";
import { BLANK } from "@/lib/workspace";

describe("natural-language edits", () => {
  it("handles conversational title phrasings", () => {
    for (const phrase of [
      "Set the title to Neon Lab",
      "change the heading to Neon Lab",
      "make the title Neon Lab",
      "title: Neon Lab",
    ]) {
      const r = planEdit(BLANK, phrase);
      expect(r.ok, phrase).toBe(true);
      expect(r.patch["index.html"], phrase).toContain("Neon Lab");
    }
  });
  it("handles conversational background phrasings", () => {
    for (const phrase of [
      "background #0a0e17",
      "change the background to #0a0e17",
      "set background colour to #0a0e17",
    ]) {
      const r = planEdit(BLANK, phrase);
      expect(r.ok, phrase).toBe(true);
      expect(r.patch["styles.css"], phrase).toMatch(/background:#0a0e17/);
    }
  });
  it("inserts a heading inside <body> for a full document (no broken markup)", () => {
    const full = {
      "index.html":
        "<!doctype html><html><head><title>x</title></head><body><p>hi</p></body></html>",
      "styles.css": "",
      "app.js": "",
    };
    const r = planEdit(full, "set title to Hello");
    expect(r.patch["index.html"]).toMatch(/<body>\s*<h1>Hello<\/h1>/);
    expect(r.patch["index.html"]).toMatch(/<title>Hello<\/title>/);
  });
});
