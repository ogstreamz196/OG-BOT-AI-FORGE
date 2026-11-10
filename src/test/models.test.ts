import { beforeEach, describe, expect, it } from "vitest";
import { models } from "@/lib/models";

const LIVE = ["llama3.2:3b", "qwen2.5-coder:32b", "deepseek-r1:8b", "nomic-embed-text"];

describe("models.syncLive", () => {
  beforeEach(() => models._reset());

  it("records the live list and auto-picks the best coder as active", () => {
    models.syncLive(LIVE);
    expect(models.live()).toEqual(LIVE);
    expect(models.liveCount()).toBe(4);
    expect(models.get().active).toBe("qwen2.5-coder:32b");
  });

  it("keeps a manual active model when it is still installed", () => {
    models.setActive("deepseek-r1:8b");
    models.syncLive(LIVE);
    expect(models.get().active).toBe("deepseek-r1:8b");
  });

  it("re-picks when the active model is no longer installed", () => {
    models.setActive("some-old-model:7b");
    models.syncLive(LIVE);
    expect(models.get().active).toBe("qwen2.5-coder:32b");
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

  it("falls back to the first live model when nothing is active", () => {
    models.syncLive(LIVE);
    models.setActive(null);
    expect(models.activeTag()).toBe("llama3.2:3b");
  });

  it("is null with no models and no active", () => {
    expect(models.activeTag()).toBeNull();
  });
});

describe("owner's Ollama models are in the catalog", () => {
  it("lists exactly the models on the RTX 5080 rig, each fitting 16 GB", async () => {
    const { MODEL_CATALOG } = await import("@/lib/models");
    const tags = MODEL_CATALOG.map((m) => m.pull);
    const RIG = ["qwen2.5-coder:14b", "qwen2.5-coder:7b", "qwen2.5:14b", "qwen2.5:7b", "deepseek-r1:14b", "deepseek-r1:8b", "phi4:14b", "dolphin3:8b", "mistral-nemo:12b", "hermes3:8b", "llama3.2-vision:11b", "llama3.2:3b", "llama3.2:1b", "nomic-embed-text:latest"];
    expect(tags.filter((t) => t.includes(":"))).toEqual(RIG);
    expect(MODEL_CATALOG.every((m) => m.vram <= 16)).toBe(true);
  });
});
