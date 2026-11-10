import { beforeEach, describe, expect, it } from "vitest";
import { gallery } from "@/lib/gallery";

describe("gallery store", () => {
  beforeEach(() => gallery.clear());

  it("adds creations newest-first with ids", () => {
    gallery.add([{ kind: "image", prompt: "a", url: "u1", seed: 1 }]);
    gallery.add([{ kind: "image", prompt: "b", url: "u2", seed: 2 }]);
    const items = gallery.get();
    expect(items).toHaveLength(2);
    expect(items[0]!.prompt).toBe("b");
    expect(items[0]!.id).toBeTruthy();
  });

  it("adds a batch in order", () => {
    gallery.add([
      { kind: "image", prompt: "x", url: "u1", seed: 1 },
      { kind: "image", prompt: "y", url: "u2", seed: 2 },
    ]);
    expect(gallery.get().map((c) => c.prompt)).toEqual(["x", "y"]);
  });

  it("removes and clears", () => {
    gallery.add([{ kind: "image", prompt: "a", url: "u1", seed: 1 }]);
    const id = gallery.get()[0]!.id;
    gallery.remove(id);
    expect(gallery.count()).toBe(0);
    gallery.add([{ kind: "image", prompt: "b", url: "u2", seed: 2 }]);
    gallery.clear();
    expect(gallery.count()).toBe(0);
  });

  it("caps at 60 items", () => {
    gallery.add(
      Array.from({ length: 70 }, (_, i) => ({
        kind: "image" as const,
        prompt: `p${i}`,
        url: `u${i}`,
        seed: i,
      })),
    );
    expect(gallery.count()).toBe(60);
  });
});
