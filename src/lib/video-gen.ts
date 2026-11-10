/**
 * Image → Video engine (Stable Video Diffusion on ComfyUI). Animates a still —
 * generated deterministically from the same prompt+seed, so no file round-trip —
 * into a short clip. Detection-gated: the UI only offers "Animate" when the
 * ComfyUI instance actually has the SVD nodes + model, so it never breaks.
 * Pure helpers are unit-tested; the client reuses image-gen's queue/poll.
 */

import { buildPrompt, parseNodeOptions, type GenOpts } from "./image-gen";

export type VideoOpts = {
  frames: number;
  fps: number;
  motion: number; // motion_bucket_id
  augmentation: number;
  steps: number;
  cfg: number;
  minCfg: number;
  width: number;
  height: number;
  svdCheckpoint: string;
};

export const DEFAULT_VIDEO: VideoOpts = {
  frames: 25,
  fps: 8,
  motion: 127,
  augmentation: 0,
  steps: 20,
  cfg: 2.5,
  minCfg: 1,
  width: 1024,
  height: 576,
  svdCheckpoint: "svd_xt.safetensors",
};

/**
 * A combined graph: regenerate the exact still (SDXL txt2img from the stored
 * opts/seed), then feed it straight into SVD img2vid — one job, no uploads.
 */
export function svdAnimateWorkflow(img: GenOpts, v: VideoOpts): Record<string, unknown> {
  const { positive, negative } = buildPrompt(img.prompt, img.styleId, img.negative);
  const ckpt = img.checkpoint || "sd_xl_base_1.0.safetensors";
  return {
    // ── still (SDXL) ──
    "4": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: ckpt } },
    "5": { class_type: "EmptyLatentImage", inputs: { width: img.width, height: img.height, batch_size: 1 } },
    "6": { class_type: "CLIPTextEncode", inputs: { text: positive, clip: ["4", 1] } },
    "7": { class_type: "CLIPTextEncode", inputs: { text: negative, clip: ["4", 1] } },
    "3": {
      class_type: "KSampler",
      inputs: {
        seed: img.seed,
        steps: img.steps,
        cfg: img.cfg,
        sampler_name: img.sampler,
        scheduler: img.scheduler,
        denoise: 1,
        model: ["4", 0],
        positive: ["6", 0],
        negative: ["7", 0],
        latent_image: ["5", 0],
      },
    },
    "8": { class_type: "VAEDecode", inputs: { samples: ["3", 0], vae: ["4", 2] } },
    // ── animate (SVD) ──
    "15": { class_type: "ImageOnlyCheckpointLoader", inputs: { ckpt_name: v.svdCheckpoint } },
    "12": {
      class_type: "SVD_img2vid_Conditioning",
      inputs: {
        clip_vision: ["15", 1],
        init_image: ["8", 0],
        vae: ["15", 2],
        width: v.width,
        height: v.height,
        video_frames: v.frames,
        motion_bucket_id: v.motion,
        fps: v.fps,
        augmentation_level: v.augmentation,
      },
    },
    "14": { class_type: "VideoLinearCFGGuidance", inputs: { model: ["15", 0], min_cfg: v.minCfg } },
    "13": {
      class_type: "KSampler",
      inputs: {
        seed: img.seed,
        steps: v.steps,
        cfg: v.cfg,
        sampler_name: "euler",
        scheduler: "karras",
        denoise: 1,
        model: ["14", 0],
        positive: ["12", 0],
        negative: ["12", 1],
        latent_image: ["12", 2],
      },
    },
    "11": { class_type: "VAEDecode", inputs: { samples: ["13", 0], vae: ["15", 2] } },
    "10": {
      class_type: "SaveAnimatedWEBP",
      inputs: { images: ["11", 0], filename_prefix: "ogbot_vid", fps: v.fps, lossless: false, quality: 85, method: "default" },
    },
  };
}

export type VideoCapability = {
  svd: boolean;
  animatediff: boolean;
  svdModels: string[];
  /** A usable SVD checkpoint if one is installed. */
  suggestedCheckpoint: string | null;
};

/** Determine which video pipelines a ComfyUI /object_info supports. Pure + tested. */
export function parseVideoCapability(objectInfo: unknown): VideoCapability {
  const has = (node: string) =>
    !!objectInfo && typeof objectInfo === "object" && node in (objectInfo as Record<string, unknown>);
  const svdNodes = has("SVD_img2vid_Conditioning") && has("ImageOnlyCheckpointLoader");
  const models = parseNodeOptions(objectInfo, "ImageOnlyCheckpointLoader", "ckpt_name");
  const svdModels = models.filter((m) => /svd|video/i.test(m));
  const animatediff =
    has("ADE_AnimateDiffLoaderGen1") || has("AnimateDiffLoaderGen1") || has("AnimateDiffLoaderV1");
  return {
    svd: svdNodes && svdModels.length > 0,
    animatediff,
    svdModels,
    suggestedCheckpoint: svdModels[0] ?? null,
  };
}

/** Fetch video capability from ComfyUI (never throws). */
export async function fetchVideoCapability(baseUrl: string): Promise<VideoCapability> {
  const empty: VideoCapability = { svd: false, animatediff: false, svdModels: [], suggestedCheckpoint: null };
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/object_info`);
    if (!res.ok) return empty;
    return parseVideoCapability(await res.json());
  } catch {
    return empty;
  }
}
