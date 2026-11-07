/**
 * Music Video Studio engine — pure helpers + thin API clients.
 *
 * Pipeline: a local Ollama "director" model turns a track concept into strict
 * JSON (Suno audio config + a timed storyboard); the storyboard drives a local
 * ComfyUI render, with a graceful staged/preview fallback (prompt export +
 * workflow JSON + an FFmpeg concat script) when ComfyUI isn't running.
 * The pure functions are unit-tested; the clients degrade gracefully.
 */

export type TrackConcept = {
  genre: string;
  theme: string;
  bpm: number;
  durationSec: number;
  extra?: string;
};

export type SunoConfig = { style_prompt: string; lyrics: string };

export type Scene = {
  scene_id: number;
  start_sec: number;
  end_sec: number;
  lyric_cue: string;
  visual_prompt: string;
  camera_motion: string;
};

export type DirectorOutput = { suno_config: SunoConfig; storyboard: Scene[] };

export const DEFAULT_DIRECTOR_MODELS = [
  "mistral-nemo:12b",
  "qwen2.5:14b",
  "llama3.3:70b",
  "deepseek-r1:8b",
];

/** Pick the best available director model. */
export function pickDirectorModel(installed: string[]): string {
  for (const pref of DEFAULT_DIRECTOR_MODELS) {
    const hit = installed.find((m) => m === pref) ?? installed.find((m) => m.startsWith(pref));
    if (hit) return hit;
  }
  return installed.find((m) => !/embed/i.test(m)) ?? installed[0] ?? "mistral-nemo:12b";
}

/** Build the strict-JSON director prompt from a concept. */
export function directorPrompt(c: TrackConcept): string {
  const scenes = Math.max(3, Math.min(12, Math.round(c.durationSec / 15)));
  return `You are a music video director and songwriter. Design a track and its video.
Concept: genre="${c.genre}", theme="${c.theme}", bpm=${c.bpm}, duration=${c.durationSec}s.${c.extra ? ` Notes: ${c.extra}.` : ""}
Return ONLY JSON matching exactly this shape (no prose, no markdown):
{
  "suno_config": {
    "style_prompt": "comma-separated Suno style tags + instrumentation for the genre/bpm",
    "lyrics": "full lyrics using [Verse], [Chorus], [Drop] section cues"
  },
  "storyboard": [
    {
      "scene_id": 1,
      "start_sec": 0,
      "end_sec": 0,
      "lyric_cue": "which lyric/section plays here",
      "visual_prompt": "a vivid text-to-image prompt for this scene",
      "camera_motion": "one of: static, pan-left, pan-right, zoom-in, zoom-out, dolly, orbit, handheld"
    }
  ]
}
Create about ${scenes} scenes that tile the full ${c.durationSec}s with no gaps (each end_sec = next start_sec).`;
}

/** Tolerant parse of the director model's response into a validated DirectorOutput. */
export function parseDirectorJSON(text: string): DirectorOutput | null {
  if (!text) return null;
  let body = text.trim();
  const fence = body.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) body = fence[1]!.trim();
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  let obj: unknown;
  try {
    obj = JSON.parse(body.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!obj || typeof obj !== "object") return null;
  const o = obj as { suno_config?: unknown; storyboard?: unknown };
  const sc = (o.suno_config ?? {}) as { style_prompt?: unknown; lyrics?: unknown };
  const rawScenes = Array.isArray(o.storyboard) ? o.storyboard : [];
  const storyboard: Scene[] = rawScenes.map((s, i) => {
    const r = (s ?? {}) as Record<string, unknown>;
    return {
      scene_id: typeof r["scene_id"] === "number" ? (r["scene_id"] as number) : i + 1,
      start_sec: Number(r["start_sec"]) || 0,
      end_sec: Number(r["end_sec"]) || 0,
      lyric_cue: String(r["lyric_cue"] ?? ""),
      visual_prompt: String(r["visual_prompt"] ?? ""),
      camera_motion: String(r["camera_motion"] ?? "static"),
    };
  });
  if (storyboard.length === 0) return null;
  return {
    suno_config: {
      style_prompt: String(sc.style_prompt ?? ""),
      lyrics: String(sc.lyrics ?? ""),
    },
    storyboard,
  };
}

// ── Ollama director client ────────────────────────────────────────────────
export async function callDirector(
  baseUrl: string,
  model: string,
  concept: TrackConcept,
): Promise<DirectorOutput> {
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      prompt: directorPrompt(concept),
      format: "json",
      stream: false,
      options: { temperature: 0.7 },
    }),
  });
  if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
  const data = (await res.json()) as { response?: string };
  const out = parseDirectorJSON(data.response ?? "");
  if (!out) throw new Error("Director returned unparseable JSON");
  return out;
}

// ── ComfyUI client + workflow mapper ──────────────────────────────────────
export async function pingComfy(baseUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/system_stats`);
    return res.ok;
  } catch {
    return false;
  }
}

/** Map a scene to a standard ComfyUI txt2img API graph (SDXL-style, 16:9). */
export function comfyWorkflow(
  scene: Scene,
  opts?: { checkpoint?: string; width?: number; height?: number; steps?: number },
): Record<string, unknown> {
  const ckpt = opts?.checkpoint ?? "sd_xl_base_1.0.safetensors";
  const width = opts?.width ?? 768;
  const height = opts?.height ?? 432;
  const steps = opts?.steps ?? 20;
  const seed = Math.floor(Math.random() * 1_000_000_000);
  return {
    "4": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: ckpt } },
    "5": { class_type: "EmptyLatentImage", inputs: { width, height, batch_size: 1 } },
    "6": { class_type: "CLIPTextEncode", inputs: { text: scene.visual_prompt, clip: ["4", 1] } },
    "7": {
      class_type: "CLIPTextEncode",
      inputs: { text: "blurry, low quality, watermark, text", clip: ["4", 1] },
    },
    "3": {
      class_type: "KSampler",
      inputs: {
        seed,
        steps,
        cfg: 7,
        sampler_name: "euler",
        scheduler: "normal",
        denoise: 1,
        model: ["4", 0],
        positive: ["6", 0],
        negative: ["7", 0],
        latent_image: ["5", 0],
      },
    },
    "8": { class_type: "VAEDecode", inputs: { samples: ["3", 0], vae: ["4", 2] } },
    "9": {
      class_type: "SaveImage",
      inputs: { filename_prefix: `mv_scene_${scene.scene_id}`, images: ["8", 0] },
    },
  };
}

export async function queueComfy(
  baseUrl: string,
  graph: Record<string, unknown>,
): Promise<{ ok: boolean; promptId?: string; message: string }> {
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: graph }),
    });
    if (!res.ok) return { ok: false, message: `ComfyUI HTTP ${res.status}` };
    const data = (await res.json()) as { prompt_id?: string };
    const result: { ok: boolean; promptId?: string; message: string } = {
      ok: true,
      message: "queued",
    };
    if (data.prompt_id) result.promptId = data.prompt_id;
    return result;
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "unreachable" };
  }
}

// ── Exports for the staged / preview fallback ─────────────────────────────
export function scenePromptsText(out: DirectorOutput): string {
  return out.storyboard
    .map(
      (s) =>
        `# Scene ${s.scene_id} (${s.start_sec}-${s.end_sec}s) [${s.camera_motion}]\n${s.visual_prompt}\n(lyric: ${s.lyric_cue})`,
    )
    .join("\n\n");
}

/** FFmpeg concat demuxer script: still images per scene -> video, timed to the storyboard. */
export function concatScript(out: DirectorOutput): string {
  const lines: string[] = [
    "# ffmpeg -f concat -safe 0 -i concat.txt -vsync vfr -pix_fmt yuv420p music_video.mp4",
  ];
  out.storyboard.forEach((s) => {
    const dur = Math.max(0.5, s.end_sec - s.start_sec);
    lines.push(`file 'mv_scene_${s.scene_id}.png'`);
    lines.push(`duration ${dur}`);
  });
  const last = out.storyboard[out.storyboard.length - 1];
  if (last) lines.push(`file 'mv_scene_${last.scene_id}.png'`); // concat demuxer needs the last file repeated
  return lines.join("\n");
}

export function workflowBundle(out: DirectorOutput): string {
  const bundle = out.storyboard.map((s) => ({ scene_id: s.scene_id, workflow: comfyWorkflow(s) }));
  return JSON.stringify(bundle, null, 2);
}

export const CAMERA_MOTIONS = [
  "static",
  "pan-left",
  "pan-right",
  "zoom-in",
  "zoom-out",
  "dolly",
  "orbit",
  "handheld",
];
