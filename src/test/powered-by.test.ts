import { describe, expect, it } from "vitest";
import { POWERED_BY_ID, withPoweredBy } from "@/lib/powered-by";
import { buildDoc, standaloneIndex } from "@/lib/workspace";
import { previewDoc } from "@/lib/dev-workbench";

const count = (s: string) => s.split(`id="${POWERED_BY_ID}"`).length - 1;

describe("every site is powered by OG BOT", () => {
  it("adds the badge once, before </body>", () => {
    const doc = withPoweredBy("<html><body><h1>x</h1></body></html>");
    expect(count(doc)).toBe(1);
    expect(doc).toMatch(/Powered by <b[^>]*>OG BOT<\/b><\/a><\/body>/);
    expect(count(withPoweredBy(doc))).toBe(1);
  });
  it("is in the Build preview, single-file export and multi-file export", () => {
    const files = { "index.html": "<h1>Hi</h1>", "styles.css": "", "app.js": "" };
    expect(count(buildDoc(files))).toBe(1);
    expect(count(standaloneIndex(files))).toBe(1);
    expect(
      count(buildDoc({ ...files, "index.html": "<!doctype html><html><body>full</body></html>" })),
    ).toBe(1);
  });
  it("is in the Dev Workbench live preview", () => {
    expect(count(previewDoc([{ name: "index.html", content: "<p>x</p>" }]))).toBe(1);
  });
});
