/**
 * Image Studio engine — a real local text-to-image pipeline on top of ComfyUI,
 * designed to beat a cloud tool like Midjourney on control while staying 100%
 * offline. Pure helpers (prompt building, style presets, workflow graph,
 * response parsing) are unit-tested; the thin HTTP client degrades gracefully.
 *
 * The quality edge over a black-box cloud generator comes from:
 *  - LLM prompt enhancement (a local model rewrites a short idea into a rich,
 *    camera/lighting-aware prompt),
 *  - curated style presets with matched positive/negative/cfg/steps,
 *  - full manual control (sampler, scheduler, cfg, steps, seed, batch, size),
 *  - reproducible seeds + one-click variations and reuse.
 */

export { pingComfy, queueComfy } from "./music-video";

export type StylePreset = {
  id: string;
  name: string;
  /** Appended to the user prompt. */
  suffix: string;
  /** Added to the negative prompt. */
  negative: string;
  cfg: number;
  steps: number;
};

const BASE_NEGATIVE =
  "blurry, low quality, lowres, jpeg artifacts, watermark, signature, text, deformed, bad anatomy, extra limbs, disfigured, out of frame, cropped";

export const STYLE_PRESETS: StylePreset[] = [
  {
    id: "cinematic",
    name: "Cinematic",
    suffix:
      "cinematic film still, dramatic volumetric lighting, shallow depth of field, 35mm, color graded, highly detailed, 8k, award-winning photography",
    negative: `${BASE_NEGATIVE}, cartoon, illustration, flat lighting`,
    cfg: 6.5,
    steps: 32,
  },
  {
    id: "photoreal",
    name: "Photoreal",
    suffix:
      "ultra realistic photograph, natural lighting, sharp focus, physically based rendering, skin texture detail, shot on DSLR, 50mm f/1.8, 8k",
    negative: `${BASE_NEGATIVE}, painting, drawing, cartoon, 3d render, plastic skin`,
    cfg: 5,
    steps: 36,
  },
  {
    id: "anime",
    name: "Anime",
    suffix:
      "anime key visual, vibrant cel shading, clean line art, studio-quality, detailed eyes, dynamic composition, trending pixiv",
    negative: `${BASE_NEGATIVE}, photorealistic, 3d, realistic skin`,
    cfg: 7,
    steps: 28,
  },
  {
    id: "render3d",
    name: "3D Render",
    suffix:
      "octane render, 3d, subsurface scattering, global illumination, ray tracing, ultra detailed materials, studio lighting, cinema4d, 8k",
    negative: `${BASE_NEGATIVE}, flat, 2d, sketch`,
    cfg: 7,
    steps: 30,
  },
  {
    id: "concept",
    name: "Concept Art",
    suffix:
      "digital concept art, matte painting, epic scale, dramatic atmosphere, intricate detail, artstation trending, by greg rutkowski style lighting",
    negative: `${BASE_NEGATIVE}, snapshot, amateur`,
    cfg: 7.5,
    steps: 30,
  },
  {
    id: "neon",
    name: "Neon / Cyberpunk",
    suffix:
      "cyberpunk, neon lighting, rain-soaked streets, reflective surfaces, moody atmosphere, high contrast, cinematic, blade runner aesthetic, 8k",
    negative: `${BASE_NEGATIVE}, daylight, flat colors`,
    cfg: 7,
    steps: 30,
  },
  {
    id: "product",
    name: "Product Shot",
    suffix:
      "professional product photography, studio softbox lighting, seamless background, crisp reflections, high detail, commercial, 8k",
    negative: `${BASE_NEGATIVE}, busy background, clutter, people`,
    cfg: 6,
    steps: 30,
  },
  {
    id: "portrait",
    name: "Portrait",
    suffix:
      "stunning portrait, soft rembrandt lighting, bokeh background, detailed eyes and skin, 85mm lens, professional headshot, 8k",
    negative: `${BASE_NEGATIVE}, extra fingers, bad hands, asymmetric eyes`,
    cfg: 5.5,
    steps: 34,
  },
  {
    id: "none",
    name: "Raw (no style)",
    suffix: "",
    negative: BASE_NEGATIVE,
    cfg: 7,
    steps: 25,
  },
];

export function styleById(id: string): StylePreset {
  return STYLE_PRESETS.find((s) => s.id === id) ?? STYLE_PRESETS[STYLE_PRESETS.length - 1]!;
}

export type Aspect = { id: string; label: string; width: number; height: number };

/** SDXL-friendly resolutions (≈1 megapixel) so quality stays high at each ratio. */
export const ASPECTS: Aspect[] = [
  { id: "1:1", label: "Square 1:1", width: 1024, height: 1024 },
  { id: "3:2", label: "Landscape 3:2", width: 1216, height: 832 },
  { id: "2:3", label: "Portrait 2:3", width: 832, height: 1216 },
  { id: "16:9", label: "Wide 16:9", width: 1344, height: 768 },
  { id: "9:16", label: "Tall 9:16", width: 768, height: 1344 },
  { id: "4:5", label: "Photo 4:5", width: 896, height: 1152 },
];

export function aspectById(id: string): Aspect {
  return ASPECTS.find((a) => a.id === id) ?? ASPECTS[0]!;
}

export const SAMPLERS = [
  "dpmpp_2m",
  "dpmpp_2m_sde",
  "dpmpp_sde",
  "euler",
  "euler_ancestral",
  "ddim",
  "uni_pc",
];
export const SCHEDULERS = ["karras", "normal", "exponential", "sgm_uniform", "simple"];

export type Arch = "sdxl" | "flux";

export type FluxComponents = { unet: string; clipT5: string; clipL: string; vae: string };

export type GenOpts = {
  prompt: string;
  styleId: string;
  negative?: string;
  checkpoint?: string;
  width: number;
  height: number;
  steps: number;
  cfg: number;
  sampler: string;
  scheduler: string;
  seed: number;
  batch: number;
  /** Which model architecture to build the graph for. Defaults to sdxl. */
  arch?: Arch;
  /** Flux component files (required when arch === "flux"). */
  flux?: FluxComponents;
};

/** Combine the user prompt with the chosen style into final positive/negative text. */
export function buildPrompt(
  prompt: string,
  styleId: string,
  extraNegative?: string,
): { positive: string; negative: string } {
  const style = styleById(styleId);
  const positive = [prompt.trim(), style.suffix].filter(Boolean).join(", ");
  const negative = [style.negative, extraNegative?.trim()].filter(Boolean).join(", ");
  return { positive, negative };
}

/** A random 15-digit-ish seed. */
export function randomSeed(): number {
  return Math.floor(Math.random() * 1_000_000_000_000);
}

const clampBatch = (n: number) => Math.max(1, Math.min(8, n));

/** Standard SDXL / SD checkpoint txt2img graph. */
function sdxlWorkflow(opts: GenOpts): Record<string, unknown> {
  const { positive, negative } = buildPrompt(opts.prompt, opts.styleId, opts.negative);
  const ckpt = opts.checkpoint || "sd_xl_base_1.0.safetensors";
  return {
    "4": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: ckpt } },
    "5": {
      class_type: "EmptyLatentImage",
      inputs: { width: opts.width, height: opts.height, batch_size: clampBatch(opts.batch) },
    },
    "6": { class_type: "CLIPTextEncode", inputs: { text: positive, clip: ["4", 1] } },
    "7": { class_type: "CLIPTextEncode", inputs: { text: negative, clip: ["4", 1] } },
    "3": {
      class_type: "KSampler",
      inputs: {
        seed: opts.seed,
        steps: opts.steps,
        cfg: opts.cfg,
        sampler_name: opts.sampler,
        scheduler: opts.scheduler,
        denoise: 1,
        model: ["4", 0],
        positive: ["6", 0],
        negative: ["7", 0],
        latent_image: ["5", 0],
      },
    },
    "8": { class_type: "VAEDecode", inputs: { samples: ["3", 0], vae: ["4", 2] } },
    "9": { class_type: "SaveImage", inputs: { filename_prefix: "ogbot", images: ["8", 0] } },
  };
}

/**
 * Flux (dev/schnell) txt2img graph: separate UNET + dual CLIP (t5xxl + clip_l)
 * + VAE, with FluxGuidance and cfg fixed at 1 (Flux uses distilled guidance,
 * not classic CFG). The user's `cfg` slider drives the guidance value instead.
 */
function fluxWorkflow(opts: GenOpts): Record<string, unknown> {
  const { positive } = buildPrompt(opts.prompt, opts.styleId, opts.negative);
  const f = opts.flux ?? {
    unet: "flux1-dev.safetensors",
    clipT5: "t5xxl_fp16.safetensors",
    clipL: "clip_l.safetensors",
    vae: "ae.safetensors",
  };
  const guidance = opts.cfg > 1 ? opts.cfg : 3.5;
  return {
    "12": {
      class_type: "UNETLoader",
      inputs: { unet_name: f.unet, weight_dtype: "default" },
    },
    "11": {
      class_type: "DualCLIPLoader",
      inputs: { clip_name1: f.clipT5, clip_name2: f.clipL, type: "flux" },
    },
    "10": { class_type: "VAELoader", inputs: { vae_name: f.vae } },
    "5": {
      class_type: "EmptySD3LatentImage",
      inputs: { width: opts.width, height: opts.height, batch_size: clampBatch(opts.batch) },
    },
    "6": { class_type: "CLIPTextEncode", inputs: { text: positive, clip: ["11", 0] } },
    "33": { class_type: "CLIPTextEncode", inputs: { text: "", clip: ["11", 0] } },
    "22": {
      class_type: "FluxGuidance",
      inputs: { conditioning: ["6", 0], guidance },
    },
    "3": {
      class_type: "KSampler",
      inputs: {
        seed: opts.seed,
        steps: opts.steps,
        cfg: 1,
        sampler_name: opts.sampler,
        scheduler: opts.scheduler,
        denoise: 1,
        model: ["12", 0],
        positive: ["22", 0],
        negative: ["33", 0],
        latent_image: ["5", 0],
      },
    },
    "8": { class_type: "VAEDecode", inputs: { samples: ["3", 0], vae: ["10", 0] } },
    "9": { class_type: "SaveImage", inputs: { filename_prefix: "ogbot", images: ["8", 0] } },
  };
}

/** Build a complete ComfyUI txt2img API graph for the chosen architecture. */
export function txt2imgWorkflow(opts: GenOpts): Record<string, unknown> {
  return opts.arch === "flux" ? fluxWorkflow(opts) : sdxlWorkflow(opts);
}

export type ComfyImage = { filename: string; subfolder: string; type: string };

/** Parse a ComfyUI /history/{id} response into the output image descriptors. */
export function parseHistoryImages(history: unknown, promptId: string): ComfyImage[] {
  if (!history || typeof history !== "object") return [];
  const entry = (history as Record<string, unknown>)[promptId] as
    | { outputs?: Record<string, { images?: ComfyImage[] }> }
    | undefined;
  if (!entry?.outputs) return [];
  const out: ComfyImage[] = [];
  for (const node of Object.values(entry.outputs)) {
    for (const img of node.images ?? []) {
      if (img && typeof img.filename === "string") {
        out.push({
          filename: img.filename,
          subfolder: img.subfolder ?? "",
          type: img.type ?? "output",
        });
      }
    }
  }
  return out;
}

/** The /view URL that serves a generated image. */
export function viewUrl(baseUrl: string, img: ComfyImage): string {
  const base = baseUrl.replace(/\/$/, "");
  const q = new URLSearchParams({
    filename: img.filename,
    subfolder: img.subfolder,
    type: img.type,
  });
  return `${base}/view?${q.toString()}`;
}

/** Parse ComfyUI /object_info into the list of installed checkpoints. */
export function parseCheckpoints(objectInfo: unknown): string[] {
  if (!objectInfo || typeof objectInfo !== "object") return [];
  const node = (objectInfo as Record<string, unknown>)["CheckpointLoaderSimple"] as
    | { input?: { required?: { ckpt_name?: unknown[] } } }
    | undefined;
  const names = node?.input?.required?.ckpt_name;
  if (Array.isArray(names) && Array.isArray(names[0])) {
    return (names[0] as unknown[]).filter((x): x is string => typeof x === "string");
  }
  return [];
}

/** Read a combo (dropdown) input's option list from a node's /object_info. */
export function parseNodeOptions(objectInfo: unknown, node: string, field: string): string[] {
  if (!objectInfo || typeof objectInfo !== "object") return [];
  const n = (objectInfo as Record<string, unknown>)[node] as
    | { input?: { required?: Record<string, unknown[]>; optional?: Record<string, unknown[]> } }
    | undefined;
  const slot = n?.input?.required?.[field] ?? n?.input?.optional?.[field];
  if (Array.isArray(slot) && Array.isArray(slot[0])) {
    return (slot[0] as unknown[]).filter((x): x is string => typeof x === "string");
  }
  return [];
}

/** Pick the first option matching any hint substring, else the first option. */
export function preferOption(options: string[], hints: string[]): string {
  for (const h of hints) {
    const hit = options.find((o) => o.toLowerCase().includes(h.toLowerCase()));
    if (hit) return hit;
  }
  return options[0] ?? "";
}

/** Instruction for the local LLM to turn a short idea into a rich image prompt. */
export function enhanceInstruction(idea: string, styleId: string): string {
  const style = styleById(styleId);
  return `You are an expert ${style.name !== "Raw (no style)" ? style.name.toLowerCase() + " " : ""}image-prompt engineer. Rewrite the user's idea into ONE vivid, concrete text-to-image prompt. Include subject, setting, lighting, mood, composition, lens/camera and rich visual detail. Output ONLY the prompt as a single line of comma-separated phrases — no quotes, no preamble, no explanation, max 70 words.
Idea: ${idea}`;
}

/** Clean an LLM prompt reply down to a single usable line. */
export function cleanEnhanced(text: string): string {
  let t = text.trim();
  const fence = t.match(/```[\s\S]*?```/);
  if (fence) t = fence[0].replace(/```/g, "").trim();
  // Drop a leading label like "Prompt:".
  t = t.replace(/^\s*(prompt|output)\s*[:\-]\s*/i, "");
  // Take the first non-empty line, strip wrapping quotes.
  const line = t.split("\n").map((l) => l.trim()).find(Boolean) ?? t;
  return line.replace(/^["'`]+|["'`]+$/g, "").trim();
}

// ── Thin ComfyUI client helpers that need polling ─────────────────────────

/** Fetch installed checkpoints (empty on failure). */
export async function fetchCheckpoints(baseUrl: string): Promise<string[]> {
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/object_info/CheckpointLoaderSimple`);
    if (!res.ok) return [];
    return parseCheckpoints(await res.json());
  } catch {
    return [];
  }
}

export type FluxDiscovery = {
  unets: string[];
  clips: string[];
  vaes: string[];
  /** Best-guess defaults for the four Flux components, or null if unavailable. */
  suggested: FluxComponents | null;
};

/** Discover Flux UNET / CLIP / VAE files from ComfyUI and suggest a sensible set. */
export async function fetchFluxComponents(baseUrl: string): Promise<FluxDiscovery> {
  const base = baseUrl.replace(/\/$/, "");
  const empty: FluxDiscovery = { unets: [], clips: [], vaes: [], suggested: null };
  try {
    const [u, c, v] = await Promise.all([
      fetch(`${base}/object_info/UNETLoader`).then((r) => (r.ok ? r.json() : null)),
      fetch(`${base}/object_info/DualCLIPLoader`).then((r) => (r.ok ? r.json() : null)),
      fetch(`${base}/object_info/VAELoader`).then((r) => (r.ok ? r.json() : null)),
    ]);
    const unets = parseNodeOptions(u, "UNETLoader", "unet_name");
    const clips = parseNodeOptions(c, "DualCLIPLoader", "clip_name1");
    const vaes = parseNodeOptions(v, "VAELoader", "vae_name");
    const suggested =
      unets.length && clips.length && vaes.length
        ? {
            unet: preferOption(unets, ["flux1-dev", "flux1", "flux"]),
            clipT5: preferOption(clips, ["t5xxl", "t5"]),
            clipL: preferOption(clips, ["clip_l", "clip-l", "clip"]),
            vae: preferOption(vaes, ["ae.", "flux", "vae"]),
          }
        : null;
    return { unets, clips, vaes, suggested };
  } catch {
    return empty;
  }
}

/**
 * Poll /history/{promptId} until the render produces images or it times out.
 * Returns the image descriptors; empty array on timeout/failure.
 */
export async function waitForImages(
  baseUrl: string,
  promptId: string,
  opts?: { timeoutMs?: number; intervalMs?: number; signal?: AbortSignal },
): Promise<ComfyImage[]> {
  const base = baseUrl.replace(/\/$/, "");
  const timeoutMs = opts?.timeoutMs ?? 180_000;
  const intervalMs = opts?.intervalMs ?? 1200;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (opts?.signal?.aborted) return [];
    try {
      const init: RequestInit = {};
      if (opts?.signal) init.signal = opts.signal;
      const res = await fetch(`${base}/history/${promptId}`, init);
      if (res.ok) {
        const images = parseHistoryImages(await res.json(), promptId);
        if (images.length) return images;
      }
    } catch {
      /* keep polling */
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return [];
}
