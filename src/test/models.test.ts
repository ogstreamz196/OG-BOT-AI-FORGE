import { beforeEach, describe, expect, it } from "vitest";
import { models } from "@/lib/models";

const LIVE = ["llama3.2:3b", "qwen2.5-coder:32b", "deepseek-r1:8b", "nomic-embed-text"];

describe("models.syncLive", () => {
  beforeEach(() => models._reset());

  it("records the live list and auto-picks the best coder as active", () => {
    models.syncLive(LIVE);
    expect(models.live()).toEqual(LIVE);
    expect(models.liveCount()).toBe(4);
    // qwen2.5-coder:32b is over the 14B / 16 GB limit, so it's skipped.
    expect(models.get().active).toBe("llama3.2:3b");
    models.syncLive([...LIVE, "qwen2.5-coder:14b"]);
    expect(models.get().active).toBe("llama3.2:3b"); // keeps the still-installed choice
  });

  it("keeps a manual active model when it is still installed", () => {
    models.setActive("deepseek-r1:8b");
    models.syncLive(LIVE);
    expect(models.get().active).toBe("deepseek-r1:8b");
  });

  it("re-picks when the active model is no longer installed", () => {
    models.setActive("some-old-model:7b");
    models.syncLive([...LIVE, "qwen2.5-coder:14b"]);
    expect(models.get().active).toBe("qwen2.5-coder:14b");
  });

  it("never auto-picks an embeddings model", () => {
    models.syncLive(["nomic-embed-text", "llama3.1:8b"]);
    expect(models.get().active).not.toMatch(/embed/);
  });
});

describe("models.activeTag", () => {
  beforeEach(() => models._reset());

  it("returns a live tag directly when it is the active one", () => {
    models.syncLive(LIVE);
    models.setActive("llama3.2:3b");
    expect(models.activeTag()).toBe("llama3.2:3b");
  });

  it("resolves a catalog id to its pull tag", () => {
    models.setActive("qwen2.5-coder-7b"); // a catalog id
    expect(models.activeTag()).toBe("qwen2.5-coder:7b");
  });

  it("with nothing active, uses the coder (never a model over 14B)", () => {
    models.syncLive([...LIVE, "qwen2.5-coder:14b"]);
    models.setActive(null);
    expect(models.activeTag()).toBe("qwen2.5-coder:14b");
    models.syncLive(LIVE); // only a 32b coder installed: skip it rather than spill out of VRAM
    models.setActive(null);
    expect(models.activeTag()).not.toBe("qwen2.5-coder:32b");
  });

  it("is null with no models and no active", () => {
    expect(models.activeTag()).toBeNull();
  });
});

describe("owner's Ollama models are in the catalog", () => {
  it("lists exactly the models on the RTX 5080 rig, each fitting 16 GB", async () => {
    const { MODEL_CATALOG } = await import("@/lib/models");
    const tags = MODEL_CATALOG.map((m) => m.pull);
    const RIG = [
      "qwen2.5-coder:14b",
      "qwen2.5-coder:7b",
      "qwen2.5:14b",
      "qwen2.5:7b",
      "deepseek-r1:14b",
      "deepseek-r1:8b",
      "phi4:14b",
      "dolphin3:8b",
      "gemma4:12b",
      "mistral-nemo:12b",
      "hermes3:8b",
      "llama3.2-vision:11b",
      "llama3.2:3b",
      "nomic-embed-text:latest",
    ];
    expect(tags.filter((t) => t.includes(":"))).toEqual(RIG);
    expect(MODEL_CATALOG.every((m) => m.vram <= 16)).toBe(true);
  });
});
