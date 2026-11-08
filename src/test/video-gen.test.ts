import { describe, expect, it } from "vitest";
import { svdAnimateWorkflow, parseVideoCapability, DEFAULT_VIDEO } from "@/lib/video-gen";
import type { GenOpts } from "@/lib/image-gen";

const IMG: GenOpts = {
  prompt: "a cat",
  styleId: "cinematic",
  width: 1024,
  height: 1024,
  steps: 30,
  cfg: 6.5,
  sampler: "dpmpp_2m",
  scheduler: "karras",
  seed: 7,
  batch: 1,
};

describe("svdAnimateWorkflow", () => {
  it("chains SDXL txt2img into SVD img2vid", () => {
    const g = svdAnimateWorkflow(IMG, DEFAULT_VIDEO) as Record<string, { class_type: string; inputs: Record<string, unknown> }>;
    // still
    expect(g["4"]!.class_type).toBe("CheckpointLoaderSimple");
    expect(g["8"]!.class_type).toBe("VAEDecode");
    // svd consumes the decoded still as init_image
    expect(g["12"]!.class_type).toBe("SVD_img2vid_Conditioning");
    expect(g["12"]!.inputs["init_image"]).toEqual(["8", 0]);
    expect(g["12"]!.inputs["video_frames"]).toBe(DEFAULT_VIDEO.frames);
    expect(g["15"]!.class_type).toBe("ImageOnlyCheckpointLoader");
    expect(g["10"]!.class_type).toBe("SaveAnimatedWEBP");
  });
});

describe("parseVideoCapability", () => {
  it("detects SVD when nodes + a model are present", () => {
    const info = {
      SVD_img2vid_Conditioning: {},
      ImageOnlyCheckpointLoader: { input: { required: { ckpt_name: [["svd_xt.safetensors", "other.ckpt"]] } } },
      VideoLinearCFGGuidance: {},
    };
    const cap = parseVideoCapability(info);
    expect(cap.svd).toBe(true);
    expect(cap.suggestedCheckpoint).toBe("svd_xt.safetensors");
  });
  it("is false when the SVD model is missing even if nodes exist", () => {
    const info = {
      SVD_img2vid_Conditioning: {},
      ImageOnlyCheckpointLoader: { input: { required: { ckpt_name: [["sd_xl_base_1.0.safetensors"]] } } },
    };
    expect(parseVideoCapability(info).svd).toBe(false);
  });
  it("detects AnimateDiff nodes", () => {
    expect(parseVideoCapability({ ADE_AnimateDiffLoaderGen1: {} }).animatediff).toBe(true);
  });
  it("is all-false for empty object_info", () => {
    const cap = parseVideoCapability({});
    expect(cap.svd).toBe(false);
    expect(cap.animatediff).toBe(false);
    expect(cap.suggestedCheckpoint).toBeNull();
  });
});
