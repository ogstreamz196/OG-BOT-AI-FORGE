import { describe, expect, it } from "vitest";
import { parseCloudSections } from "@/lib/cloud";

describe("parseCloudSections", () => {
  it("accepts a bare array of sections", () => {
    const out = parseCloudSections([
      { id: "hero", label: "Hero", html: "<section></section>", css: ".x{}", keywords: ["hero"] },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.id).toBe("hero");
    expect(out[0]!.keywords).toEqual(["hero"]);
  });
  it("accepts a {sections:[...]} envelope and fills defaults", () => {
    const out = parseCloudSections({ sections: [{ id: "cta", html: "<a></a>" }] });
    expect(out[0]!.label).toBe("cta"); // defaults label to id
    expect(out[0]!.css).toBe("");
    expect(out[0]!.keywords).toEqual([]);
  });
  it("drops malformed entries", () => {
    const out = parseCloudSections([{ id: "ok", html: "<x>" }, { label: "no id" }, 42, null]);
    expect(out).toHaveLength(1);
  });
  it("returns [] for junk", () => {
    expect(parseCloudSections("nope")).toEqual([]);
    expect(parseCloudSections(null)).toEqual([]);
  });
});
