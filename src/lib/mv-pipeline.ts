/**
 * Music Video Studio — 4-stage offline pipeline (pure helpers + thin clients).
 *
 *   A. Lyrics & track structure  (local Ollama: qwen2.5:14b cinematic / dolphin3:8b gritty)
 *      → Suno-style bracket-tagged lyrics + style tags, optional push to a Suno API provider
 *   B. Scene director            (mistral-nemo:12b / qwen2.5:14b, strict JSON)
 *      → one scene per N-second cut, with diffusion + negative prompts
 *   C. ComfyUI batch payload     (Wan 2.1 / LTX-Video, or the user's own exported workflow)
 *   D. FFmpeg stitch script      (Windows .bat: concat scene clips + mux the Suno master)
 *
 * Hardware target: RTX 5080 (16 GB) over USB4, so every model here is ≤14B and
 * fully offloads to the GPU. Everything runs against the user's own machine.
 */

export const OLLAMA_URL = "http://127.0.0.1:11434";

// ── Model presets (all fit 16 GB VRAM fully on the GPU) ──────────────────────
export const LYRIC_ENGINES = [
  { tag: "qwen2.5:14b", label: "Qwen 2.5 14B · cinematic (Ultra)", style: "cinematic" as const },
  {
    tag: "qwen2.5:7b",
    label: "Qwen 2.5 7B · fast drafting (Handheld)",
    style: "cinematic" as const,
  },
  {
    tag: "dolphin3:8b",
    label: "Dolphin 3 8B · unrestricted street / explicit",
    style: "gritty" as const,
  },
];
export const DIRECTOR_ENGINES = [
  { tag: "mistral-nemo:12b", label: "Mistral Nemo 12B · strict JSON (Ultra)" },
  { tag: "qwen2.5:14b", label: "Qwen 2.5 14B · cinematic director (Ultra)" },
  { tag: "hermes3:8b", label: "Hermes 3 8B · JSON (Handheld)" },
];

/**
 * Docked Ultra = RTX 5080 eGPU, ≤14B fully in VRAM. Handheld = Ryzen AI 9 / Radeon 890M on
 * battery, 7–8B models. Switching tier swaps the default engines for each stage.
 */
export type Tier = "ultra" | "handheld";
export const TIER_DEFAULTS: Record<Tier, { label: string; lyric: string; director: string }> = {
  ultra: { label: "Docked Ultra · RTX 5080", lyric: "qwen2.5:14b", director: "mistral-nemo:12b" },
  handheld: { label: "Handheld · Ryzen AI 9", lyric: "qwen2.5:7b", director: "hermes3:8b" },
};
export type LyricStyle = "cinematic" | "gritty";

/** Ollama lists "foo" as "foo:latest"; treat them as the same model. */
export function sameTag(a: string, b: string) {
  const n = (t: string) => (t.includes(":") ? t : `${t}:latest`);
  return n(a) === n(b);
}

/** First preset that is installed, else the first preset. */
export function pickInstalled(presets: { tag: string }[], installed: string[]): string {
  return presets.find((p) => installed.some((i) => sameTag(i, p.tag)))?.tag ?? presets[0]!.tag;
}

// ── Stage A: lyrics ──────────────────────────────────────────────────────────
export type LyricsInput = {
  title?: string;
  genre: string;
  bpm: number;
  themes: string;
  durationSec: number;
  style: LyricStyle;
};
export type LyricsResult = { title: string; styleTags: string; lyrics: string; sections: string[] };

export const SECTION_TAGS = [
  "[Intro]",
  "[Verse 1]",
  "[Pre-Chorus]",
  "[Chorus]",
  "[Verse 2]",
  "[Bridge]",
  "[Heavy Beat Drop]",
  "[Guitar Solo]",
  "[Outro]",
];

export function lyricsSystemPrompt(style: LyricStyle): string {
  const voice =
    style === "gritty"
      ? "Write raw, unfiltered, gritty street lyrics: explicit language and hard imagery are allowed when the theme calls for it."
      : "Write vivid, cinematic lyrics with strong imagery and a memorable hook.";
  return `You are a professional songwriter and producer writing for Suno. ${voice}
Answer in EXACTLY this format, nothing else:
TITLE: <song title>
STYLE: <comma-separated Suno style tags: genre, sub-genre, mood, instruments, vocal type, BPM>
LYRICS:
<lyrics, every section starting on its own line with a bracket tag such as ${SECTION_TAGS.join(" ")}>`;
}

export function lyricsUserPrompt(i: LyricsInput): string {
  return `${i.title?.trim() ? `Song title: ${i.title.trim()} (use it as the TITLE)\n` : ""}Genre / style: ${i.genre}\nBPM: ${i.bpm}\nCore narrative: ${i.themes}\nTarget length: about ${Math.round(i.durationSec)} seconds.\nUse section tags that fit the genre (e.g. [Heavy Beat Drop] for grime/trap/bass, [Guitar Solo] for rock).`;
}

const stripThink = (t: string) => t.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

/** Parse the lyric model's answer. Tolerant: works even if TITLE/STYLE lines are missing. */
export function parseLyrics(text: string): LyricsResult {
  const body = stripThink(text).replace(/```[a-z]*\n?|```/gi, "");
  const title = body.match(/^\s*TITLE:\s*(.+)$/im)?.[1]?.trim() ?? "";
  const styleTags = body.match(/^\s*STYLE:\s*(.+)$/im)?.[1]?.trim() ?? "";
  const afterLabel = body.split(/^\s*LYRICS:\s*$/im)[1];
  const lyrics = (afterLabel ?? body.replace(/^\s*(TITLE|STYLE):.*$/gim, "")).trim();
  const sections = [...lyrics.matchAll(/^\s*(\[[^\]\n]{2,40}\])/gm)].map((m) => m[1]!);
  return { title, styleTags, lyrics, sections };
}

// ── Suno (any provider: endpoint + body template are user-configurable) ─────
/** Default body for common Suno API providers; placeholders are filled from Stage A. */
export const DEFAULT_SUNO_BODY = `{
  "customMode": true,
  "instrumental": false,
  "title": "{{title}}",
  "style": "{{style}}",
  "prompt": "{{lyrics}}",
  "model": "V4_5"
}`;

/** Fill {{title}} / {{style}} / {{lyrics}} in a JSON body template, JSON-escaping each value. */
export function fillSunoBody(
  template: string,
  v: { title: string; style: string; lyrics: string },
): string {
  const esc = (s: string) => JSON.stringify(s).slice(1, -1);
  return template
    .replace(/\{\{title\}\}/g, esc(v.title))
    .replace(/\{\{style\}\}/g, esc(v.style))
    .replace(/\{\{lyrics\}\}/g, esc(v.lyrics));
}

/** Find a job/task id in a provider's JSON reply (shapes differ between Suno API providers). */
export function sunoTaskId(reply: unknown): string | null {
  const r = reply as Record<string, unknown> | null;
  if (!r || typeof r !== "object") return null;
  const d = (r["data"] ?? {}) as Record<string, unknown>;
  const first = Array.isArray(r["data"])
    ? (r["data"][0] as Record<string, unknown>)
    : Array.isArray(r["clips"])
      ? (r["clips"][0] as Record<string, unknown>)
      : null;
  const id =
    r["taskId"] ??
    r["task_id"] ??
    r["id"] ??
    d["taskId"] ??
    d["task_id"] ??
    d["id"] ??
    first?.["id"];
  return typeof id === "string" || typeof id === "number" ? String(id) : null;
}

/** Audio URLs anywhere in a provider's reply (mp3/wav/m4a or *audio_url fields). */
export function sunoAudioUrls(text: string): string[] {
  const found = new Set<string>();
  for (const m of text.matchAll(/"(?:\w*audio_?url\w*|stream_?url)"\s*:\s*"(https?:[^"]+)"/gi))
    found.add(m[1]!);
  for (const m of text.matchAll(/https?:\/\/[^\s"']+\.(?:mp3|wav|m4a)(?:\?[^\s"']*)?/gi))
    found.add(m[0]);
  return [...found];
}

// ── Stage B: storyboard ──────────────────────────────────────────────────────
export type StoryScene = {
  scene_id: number;
  time_range: string;
  lyric_sync: string;
  shot_type: string;
  action_description: string;
  cinematography: string;
  diffusion_prompt: string;
  negative_prompt: string;
};

export const DEFAULT_NEGATIVE =
  "blurry, low quality, cartoon, static, 3D render artifacts, watermark, text";

export function mmss(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** Scenes needed to cover the track with fixed-length cuts (capped so prompts stay manageable). */
export function sceneCount(durationSec: number, cutSec: number): number {
  return Math.max(1, Math.min(48, Math.ceil(durationSec / Math.max(1, cutSec))));
}

export function storyboardPrompt(o: {
  lyrics: string;
  bpm: number;
  durationSec: number;
  cutSec: number;
  look?: string;
}): string {
  const n = sceneCount(o.durationSec, o.cutSec);
  return `You are a music video director. Break this track into exactly ${n} scenes of ${o.cutSec} seconds each (${mmss(0)} to ${mmss(o.durationSec)}), cutting on the beat at ${o.bpm} BPM and following the lyric sections in order.${o.look ? ` Overall visual style: ${o.look}.` : ""}
Return ONLY a JSON object of the form {"scenes": [...]} where each scene is:
{"scene_id": 1, "time_range": "00:00 - 00:05", "lyric_sync": "[Intro] or the lyric line playing", "shot_type": "low-angle dynamic tracking shot", "action_description": "what happens on screen", "cinematography": "lens, lighting, colour, film stock", "diffusion_prompt": "a complete standalone text-to-video prompt for this scene, photorealistic, --ar 16:9", "negative_prompt": "what to avoid"}
Keep the same main subject, wardrobe and colour palette across scenes for visual consistency.

LYRICS:
${o.lyrics}`;
}

/** Tolerant parse of the director's JSON (array, {scenes}, or fenced). Timestamps are re-tiled. */
export function parseStoryboard(text: string, cutSec = 5): StoryScene[] {
  let body = stripThink(text);
  const fence = body.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) body = fence[1]!.trim();
  const first = body.search(/[[{]/);
  if (first === -1) return [];
  let data: unknown;
  try {
    data = JSON.parse(
      body.slice(first, Math.max(body.lastIndexOf("]"), body.lastIndexOf("}")) + 1),
    );
  } catch {
    return [];
  }
  const raw = Array.isArray(data)
    ? data
    : ((data as { scenes?: unknown; storyboard?: unknown })?.scenes ??
      (data as { storyboard?: unknown })?.storyboard);
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((s) => s && typeof s === "object")
    .map((s, i) => {
      const r = s as Record<string, unknown>;
      const str = (k: string) => (typeof r[k] === "string" ? (r[k] as string).trim() : "");
      const action = str("action_description") || str("action");
      return {
        scene_id: i + 1,
        time_range: `${mmss(i * cutSec)} - ${mmss((i + 1) * cutSec)}`,
        lyric_sync: str("lyric_sync") || str("lyric_cue"),
        shot_type: str("shot_type") || "medium shot",
        action_description: action,
        cinematography: str("cinematography"),
        diffusion_prompt: str("diffusion_prompt") || str("visual_prompt") || action,
        negative_prompt: str("negative_prompt") || DEFAULT_NEGATIVE,
      };
    })
    .filter((s) => s.diffusion_prompt);
}

// ── Stage C: ComfyUI payloads ────────────────────────────────────────────────
export type VideoEngine = "ltxv" | "wan21" | "custom";
export const sceneFile = (id: number, total: number) =>
  `scene_${String(id).padStart(Math.max(2, String(total).length), "0")}`;

/** Frames for a cut: LTX-Video wants 8n+1 frames at 24 fps; Wan 2.1 4n+1 at 16 fps. */
export function framesFor(engine: VideoEngine, cutSec: number): { fps: number; frames: number } {
  if (engine === "wan21") return { fps: 16, frames: Math.round((cutSec * 16) / 4) * 4 + 1 };
  return { fps: 24, frames: Math.round((cutSec * 24) / 8) * 8 + 1 };
}

/**
 * Built-in text-to-video graphs (ComfyUI core nodes, recent ComfyUI). Node and model file names
 * vary between installs, so the "custom" option (your own Workflow → Export (API) file with
 * {{positive}} {{negative}} {{filename}} {{seed}} {{frames}} {{fps}} placeholders) is the exact route.
 */
export function videoGraph(
  engine: VideoEngine,
  scene: StoryScene,
  o: { cutSec: number; total: number; seed: number; template?: string },
): Record<string, unknown> {
  const { fps, frames } = framesFor(engine === "custom" ? "ltxv" : engine, o.cutSec);
  const filename = sceneFile(scene.scene_id, o.total);
  if (engine === "custom") {
    const esc = (s: string) => JSON.stringify(s).slice(1, -1);
    const filled = (o.template ?? "{}")
      .replace(/\{\{positive\}\}/g, esc(scene.diffusion_prompt))
      .replace(/\{\{negative\}\}/g, esc(scene.negative_prompt))
      .replace(/\{\{filename\}\}/g, esc(filename))
      .replace(/"?\{\{seed\}\}"?/g, String(o.seed))
      .replace(/"?\{\{frames\}\}"?/g, String(frames))
      .replace(/"?\{\{fps\}\}"?/g, String(fps));
    return JSON.parse(filled) as Record<string, unknown>;
  }
  const save = {
    "20": { class_type: "CreateVideo", inputs: { images: ["8", 0], fps } },
    "21": {
      class_type: "SaveVideo",
      inputs: { video: ["20", 0], filename_prefix: filename, format: "mp4", codec: "h264" },
    },
  };
  if (engine === "wan21") {
    return {
      "1": {
        class_type: "UNETLoader",
        inputs: { unet_name: "wan2.1_t2v_14B_fp8_e4m3fn.safetensors", weight_dtype: "default" },
      },
      "2": {
        class_type: "CLIPLoader",
        inputs: { clip_name: "umt5_xxl_fp8_e4m3fn_scaled.safetensors", type: "wan" },
      },
      "3": { class_type: "VAELoader", inputs: { vae_name: "wan_2.1_vae.safetensors" } },
      "4": {
        class_type: "CLIPTextEncode",
        inputs: { text: scene.diffusion_prompt, clip: ["2", 0] },
      },
      "5": {
        class_type: "CLIPTextEncode",
        inputs: { text: scene.negative_prompt, clip: ["2", 0] },
      },
      "6": {
        class_type: "EmptyHunyuanLatentVideo",
        inputs: { width: 832, height: 480, length: frames, batch_size: 1 },
      },
      "7": {
        class_type: "KSampler",
        inputs: {
          seed: o.seed,
          steps: 30,
          cfg: 6,
          sampler_name: "uni_pc",
          scheduler: "simple",
          denoise: 1,
          model: ["1", 0],
          positive: ["4", 0],
          negative: ["5", 0],
          latent_image: ["6", 0],
        },
      },
      "8": { class_type: "VAEDecode", inputs: { samples: ["7", 0], vae: ["3", 0] } },
      ...save,
    };
  }
  return {
    "1": {
      class_type: "CheckpointLoaderSimple",
      inputs: { ckpt_name: "ltx-video-2b-v0.9.5.safetensors" },
    },
    "2": {
      class_type: "CLIPLoader",
      inputs: { clip_name: "t5xxl_fp16.safetensors", type: "ltxv" },
    },
    "4": { class_type: "CLIPTextEncode", inputs: { text: scene.diffusion_prompt, clip: ["2", 0] } },
    "5": { class_type: "CLIPTextEncode", inputs: { text: scene.negative_prompt, clip: ["2", 0] } },
    "9": {
      class_type: "LTXVConditioning",
      inputs: { positive: ["4", 0], negative: ["5", 0], frame_rate: fps },
    },
    "6": {
      class_type: "EmptyLTXVLatentVideo",
      inputs: { width: 768, height: 512, length: frames, batch_size: 1 },
    },
    "10": {
      class_type: "LTXVScheduler",
      inputs: {
        steps: 30,
        max_shift: 2.05,
        base_shift: 0.95,
        stretch: true,
        terminal: 0.1,
        latent: ["6", 0],
      },
    },
    "11": { class_type: "KSamplerSelect", inputs: { sampler_name: "euler" } },
    "12": { class_type: "RandomNoise", inputs: { noise_seed: o.seed } },
    "13": {
      class_type: "CFGGuider",
      inputs: { model: ["1", 0], positive: ["9", 0], negative: ["9", 1], cfg: 3 },
    },
    "7": {
      class_type: "SamplerCustomAdvanced",
      inputs: {
        noise: ["12", 0],
        guider: ["13", 0],
        sampler: ["11", 0],
        sigmas: ["10", 0],
        latent_image: ["6", 0],
      },
    },
    "8": { class_type: "VAEDecode", inputs: { samples: ["7", 0], vae: ["1", 2] } },
    ...save,
  };
}

/** Downloadable batch: one ComfyUI /prompt body per scene. */
export function comfyBatch(
  engine: VideoEngine,
  scenes: StoryScene[],
  o: { cutSec: number; template?: string; baseSeed?: number },
) {
  const base = o.baseSeed ?? 424242;
  return scenes.map((s) => ({
    scene_id: s.scene_id,
    filename: sceneFile(s.scene_id, scenes.length),
    prompt: videoGraph(engine, s, {
      cutSec: o.cutSec,
      total: scenes.length,
      seed: base + s.scene_id,
      ...(o.template ? { template: o.template } : {}),
    }),
  }));
}

/** True once ComfyUI's /history/{id} reply shows outputs for that prompt (i.e. the clip rendered). */
export function comfyFinished(history: unknown, promptId: string): boolean {
  const h = (
    history as Record<
      string,
      { outputs?: Record<string, unknown>; status?: { completed?: boolean } }
    > | null
  )?.[promptId];
  return !!h && (h.status?.completed === true || Object.keys(h.outputs ?? {}).length > 0);
}

// ── Stage D: Windows FFmpeg stitch script ────────────────────────────────────
export function stitchBatch(
  scenes: { scene_id: number }[],
  o: { ffmpeg?: string; audio?: string; folder?: string } = {},
): string {
  const ff = o.ffmpeg?.trim() || "ffmpeg";
  const q = (p: string) => (/[\s&()]/.test(p) && !p.startsWith('"') ? `"${p}"` : p);
  const audio = o.audio?.trim() || "suno_track.mp3";
  const names = scenes.map((s) => sceneFile(s.scene_id, scenes.length));
  const L: string[] = [
    "@echo off",
    "REM OG-BOT Music Video Studio: stitch scene clips + Suno master into one video.",
    "REM Put this file next to your rendered clips (ComfyUI output folder) and run it.",
    "setlocal",
    o.folder?.trim() ? `cd /d ${q(o.folder.trim())}` : 'cd /d "%~dp0"',
    "set MISSING=0",
    "REM ComfyUI adds a counter (scene_01_00001_.mp4): copy the newest take to scene_01.mp4",
  ];
  for (const n of names) {
    L.push(`if not exist ${n}.mp4 for %%f in (${n}_*.mp4) do copy /y "%%f" ${n}.mp4 >nul`);
    L.push(`if not exist ${n}.mp4 (echo Missing ${n}.mp4 & set MISSING=1)`);
  }
  L.push('if "%MISSING%"=="1" (echo Render the missing scenes first. & pause & exit /b 1)');
  L.push("del concat.txt 2>nul");
  for (const n of names) L.push(`>>concat.txt echo file '${n}.mp4'`);
  L.push(`${q(ff)} -y -f concat -safe 0 -i concat.txt -c copy assembled_visuals.mp4 || goto :fail`);
  L.push(
    `${q(ff)} -y -i assembled_visuals.mp4 -i ${q(audio)} -c:v copy -c:a aac -shortest final_master_music_video.mp4 || goto :fail`,
  );
  L.push(
    "echo Done: final_master_music_video.mp4",
    "pause",
    "exit /b 0",
    ":fail",
    "echo FFmpeg failed - check the clips and audio file above.",
    "pause",
    "exit /b 1",
  );
  return L.join("\r\n");
}

// ── Ollama streaming client (NDJSON via ReadableStreamDefaultReader) ─────────
export type ChatMsg = { role: "system" | "user" | "assistant"; content: string };

export async function streamOllama(o: {
  baseUrl: string;
  model: string;
  messages: ChatMsg[];
  onToken: (t: string) => void;
  json?: boolean;
  temperature?: number;
  signal?: AbortSignal;
}): Promise<string> {
  const res = await fetch(`${o.baseUrl.replace(/\/+$/, "")}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: o.model,
      messages: o.messages,
      stream: true,
      keep_alive: "30m",
      ...(o.json ? { format: "json" } : {}),
      options: { temperature: o.temperature ?? 0.7, num_ctx: 8192 },
    }),
    signal: o.signal ?? null,
  });
  if (res.status === 403)
    throw new Error("Ollama blocked this site (403): set OLLAMA_ORIGINS=* and restart Ollama.");
  if (!res.ok || !res.body) {
    const t = await res.text().catch(() => "");
    let msg = t;
    try {
      msg = (JSON.parse(t) as { error?: string }).error ?? t;
    } catch {
      /* not JSON */
    }
    throw new Error(
      /not found/i.test(msg)
        ? `${o.model} isn't installed: run  ollama pull ${o.model}`
        : msg || `Ollama HTTP ${res.status}`,
    );
  }
  const reader: ReadableStreamDefaultReader<Uint8Array> = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let full = "";
  const line = (l: string) => {
    if (!l.trim()) return;
    const c = JSON.parse(l) as { message?: { content?: string }; error?: string };
    if (c.error) throw new Error(c.error);
    const p = c.message?.content ?? "";
    if (p) {
      full += p;
      o.onToken(p);
    }
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const parts = buf.split("\n");
    buf = parts.pop() ?? "";
    parts.forEach(line);
  }
  line(buf);
  return full;
}

export async function listOllama(baseUrl: string, signal?: AbortSignal): Promise<string[]> {
  const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/api/tags`, { signal: signal ?? null });
  if (!res.ok)
    throw new Error(
      res.status === 403 ? "Ollama blocked this site (403)" : `Ollama HTTP ${res.status}`,
    );
  return (((await res.json()) as { models?: { name: string }[] }).models ?? []).map((m) => m.name);
}
