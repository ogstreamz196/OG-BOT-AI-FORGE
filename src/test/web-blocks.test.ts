import { describe, expect, it } from "vitest";
import { wrapBlock, parseBlocks, moveBlock, removeBlock, duplicateBlock } from "@/lib/web-blocks";

const html = () =>
  `<body>\n${wrapBlock("hero", "<section>HERO</section>")}\n${wrapBlock("pricing", "<section>PRICE</section>")}\n${wrapBlock("footer", "<footer>F</footer>")}\n</body>`;

describe("web-blocks", () => {
  it("parses blocks in order", () => {
    expect(parseBlocks(html()).map((b) => b.id)).toEqual(["hero", "pricing", "footer"]);
  });
  it("moves a block up and down", () => {
    expect(parseBlocks(moveBlock(html(), 1, "up")).map((b) => b.id)).toEqual([
      "pricing",
      "hero",
      "footer",
    ]);
    expect(parseBlocks(moveBlock(html(), 0, "down")).map((b) => b.id)).toEqual([
      "pricing",
      "hero",
      "footer",
    ]);
  });
  it("is a no-op at the edges", () => {
    expect(moveBlock(html(), 0, "up")).toBe(html());
    expect(moveBlock(html(), 2, "down")).toBe(html());
  });
  it("removes a block", () => {
    expect(parseBlocks(removeBlock(html(), 1)).map((b) => b.id)).toEqual(["hero", "footer"]);
  });
  it("duplicates a block right after itself", () => {
    expect(parseBlocks(duplicateBlock(html(), 0)).map((b) => b.id)).toEqual([
      "hero",
      "hero",
      "pricing",
      "footer",
    ]);
  });
  it("keeps the rest of the document intact", () => {
    expect(removeBlock(html(), 1)).toContain("</body>");
    expect(duplicateBlock(html(), 0)).toContain("<body>");
  });
});
