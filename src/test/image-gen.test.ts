import { describe, expect, it } from "vitest";
import {
  buildPrompt,
  txt2imgWorkflow,
  parseHistoryImages,
  viewUrl,
  parseCheckpoints,
  cleanEnhanced,
  aspectById,
  styleById,
  type GenOpts,
} from "@/lib/image-gen";

const OPTS: GenOpts = {
  prompt: "a cat",
  styleId: "cinematic",
  width: 1024,
  height: 1024,
  steps: 30,
  cfg: 7,
  sampler: "euler",
  scheduler: "normal",
  seed: 42,
  batch: 2,
};

describe("buildPrompt", () => {
  it("merges the user prompt with the style suffix + negatives", () => {
    const { positive, negative } = buildPrompt("a cat", "cinematic", "ugly");
    expect(positive.startsWith("a cat,")).toBe(true);
    expect(positive).toMatch(/cinematic/);
    expect(negative).toMatch(/blurry/);
    expect(negative).toMatch(/ugly$/);
  });
  it("raw style adds no suffix", () => {
    expect(buildPrompt("a cat", "none").positive).toBe("a cat");
  });
});

describe("txt2imgWorkflow", () => {
  it("produces a valid ComfyUI graph honoring the options", () => {
    const g = txt2imgWorkflow(OPTS) as Record<string, { class_type: string; inputs: Record<string, unknown> }>;
    expect(g["3"]!.inputs["seed"]).toBe(42);
    expect(g["3"]!.inputs["steps"]).toBe(30);
    expect(g["3"]!.inputs["sampler_name"]).toBe("euler");
    expect(g["5"]!.inputs["batch_size"]).toBe(2);
    expect(g["5"]!.inputs["width"]).toBe(1024);
    expect(g["9"]!.class_type).toBe("SaveImage");
  });
  it("clamps batch to 1..8", () => {
    const g = txt2imgWorkflow({ ...OPTS, batch: 99 }) as Record<string, { inputs: Record<string, unknown> }>;
    expect(g["5"]!.inputs["batch_size"]).toBe(8);
  });
});

describe("parseHistoryImages", () => {
  it("extracts image descriptors for a prompt id", () => {
    const history = {
      "abc": {
        outputs: {
          "9": { images: [{ filename: "ogbot_001.png", subfolder: "", type: "output" }] },
        },
      },
    };
    const imgs = parseHistoryImages(history, "abc");
    expect(imgs).toHaveLength(1);
    expect(imgs[0]!.filename).toBe("ogbot_001.png");
  });
  it("returns empty for a missing id", () => {
    expect(parseHistoryImages({}, "nope")).toEqual([]);
  });
});

describe("viewUrl", () => {
  it("builds a /view url with query params", () => {
    const url = viewUrl("http://127.0.0.1:8188/", {
      filename: "a b.png",
      subfolder: "sub",
      type: "output",
    });
    expect(url).toContain("http://127.0.0.1:8188/view?");
    expect(url).toContain("filename=a+b.png");
    expect(url).toContain("subfolder=sub");
  });
});

describe("parseCheckpoints", () => {
  it("reads checkpoint names from object_info", () => {
    const info = {
      CheckpointLoaderSimple: { input: { required: { ckpt_name: [["sdxl.safetensors", "dreamshaper.safetensors"]] } } },
    };
    expect(parseCheckpoints(info)).toEqual(["sdxl.safetensors", "dreamshaper.safetensors"]);
  });
  it("is empty when absent", () => {
    expect(parseCheckpoints({})).toEqual([]);
  });
});

describe("cleanEnhanced", () => {
  it("strips labels, quotes and extra lines", () => {
    expect(cleanEnhanced('Prompt: "a majestic cat, golden hour"\nextra')).toBe(
      "a majestic cat, golden hour",
    );
  });
  it("unwraps a fenced reply", () => {
    expect(cleanEnhanced("```\na neon city\n```")).toBe("a neon city");
  });
});

describe("lookups", () => {
  it("resolve by id with fallbacks", () => {
    expect(aspectById("16:9").width).toBe(1344);
    expect(aspectById("bogus").id).toBe("1:1");
    expect(styleById("photoreal").cfg).toBe(5);
    expect(styleById("bogus").id).toBe("none");
  });
});
