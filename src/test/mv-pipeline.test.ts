import { afterEach, describe, expect, it, vi } from "vitest";
import {
  TIER_DEFAULTS,
  comfyFinished,
  sunoAudioUrls,
  sunoTaskId,
  comfyBatch,
  fillSunoBody,
  framesFor,
  mmss,
  parseLyrics,
  parseStoryboard,
  pickInstalled,
  LYRIC_ENGINES,
  sceneCount,
  sceneFile,
  stitchBatch,
  streamOllama,
  videoGraph,
  type StoryScene,
} from "@/lib/mv-pipeline";

afterEach(() => vi.unstubAllGlobals());

const scene = (id: number): StoryScene => ({
  scene_id: id,
  time_range: "",
  lyric_sync: "",
  shot_type: "wide",
  action_description: "walks",
  cinematography: "35mm",
  diffusion_prompt: `prompt "${id}"`,
  negative_prompt: "blurry",
});

describe("Stage A: lyrics", () => {
  it("parses title, style tags and bracket sections, ignoring <think> and fences", () => {
    const r = parseLyrics(
      "<think>plan</think>```\nTITLE: Neon Rain\nSTYLE: synthwave, 110 BPM, female vocals\nLYRICS:\n[Intro]\nLights\n[Verse 1]\nDown the road\n[Heavy Bass Drop]\n[Outro]\nGone\n```",
    );
    expect(r.title).toBe("Neon Rain");
    expect(r.styleTags).toBe("synthwave, 110 BPM, female vocals");
    expect(r.sections).toEqual(["[Intro]", "[Verse 1]", "[Heavy Bass Drop]", "[Outro]"]);
    expect(r.lyrics.startsWith("[Intro]")).toBe(true);
  });
  it("still returns lyrics when the model skips the labels", () => {
    expect(parseLyrics("[Verse 1]\nhello").lyrics).toBe("[Verse 1]\nhello");
  });
  it("fills the Suno body template with JSON-safe values", () => {
    const body = fillSunoBody('{"title":"{{title}}","prompt":"{{lyrics}}","style":"{{style}}"}', {
      title: 'A "B"',
      style: "rap",
      lyrics: "line1\nline2",
    });
    expect(JSON.parse(body)).toEqual({ title: 'A "B"', prompt: "line1\nline2", style: "rap" });
  });
  it("prefers an installed engine", () => {
    expect(pickInstalled(LYRIC_ENGINES, ["dolphin3:8b"])).toBe("dolphin3:8b");
    expect(pickInstalled(LYRIC_ENGINES, [])).toBe("qwen2.5:14b");
  });
});

describe("Stage B: storyboard", () => {
  it("parses {scenes:[...]} and re-tiles timestamps to the cut length", () => {
    const s = parseStoryboard(
      '{"scenes":[{"shot_type":"low-angle","action":"walks","diffusion_prompt":"city"},{"visual_prompt":"rooftop"}]}',
      5,
    );
    expect(s.map((x) => x.time_range)).toEqual(["00:00 - 00:05", "00:05 - 00:10"]);
    expect(s[1]!.diffusion_prompt).toBe("rooftop");
    expect(s[1]!.negative_prompt).toMatch(/blurry/);
  });
  it("accepts a bare array and drops scenes with no prompt", () => {
    expect(parseStoryboard('[{"diffusion_prompt":"a"},{"action":""}]')).toHaveLength(1);
  });
  it("returns [] on garbage", () => expect(parseStoryboard("no json here")).toEqual([]));
  it("counts scenes and formats time", () => {
    expect(sceneCount(90, 5)).toBe(18);
    expect(sceneCount(10_000, 5)).toBe(48);
    expect(mmss(125)).toBe("02:05");
  });
});

describe("Stage C: ComfyUI payloads", () => {
  it("uses valid frame counts per engine", () => {
    expect(framesFor("ltxv", 5)).toEqual({ fps: 24, frames: 121 });
    expect(framesFor("wan21", 5)).toEqual({ fps: 16, frames: 81 });
  });
  it("builds one graph per scene saving to scene_NN", () => {
    const b = comfyBatch("ltxv", [scene(1), scene(2)], { cutSec: 5 });
    expect(b.map((x) => x.filename)).toEqual(["scene_01", "scene_02"]);
    const save = Object.values(b[0]!.prompt).find(
      (n) => (n as { class_type: string }).class_type === "SaveVideo",
    ) as { inputs: { filename_prefix: string } };
    expect(save.inputs.filename_prefix).toBe("scene_01");
  });
  it("fills a custom exported workflow, keeping JSON valid and numbers numeric", () => {
    const tpl =
      '{"3":{"inputs":{"text":"{{positive}}","neg":"{{negative}}","seed":"{{seed}}","length":{{frames}},"prefix":"{{filename}}"}}}';
    const g = videoGraph("custom", scene(3), { cutSec: 5, total: 12, seed: 7, template: tpl }) as {
      "3": { inputs: Record<string, unknown> };
    };
    expect(g["3"].inputs).toEqual({
      text: 'prompt "3"',
      neg: "blurry",
      seed: 7,
      length: 121,
      prefix: "scene_03",
    });
  });
  it("pads file names for 100+ scenes", () => expect(sceneFile(7, 120)).toBe("scene_007"));
});

describe("Stage D: FFmpeg stitch script", () => {
  it("lists every scene, concatenates losslessly and muxes the Suno track", () => {
    const bat = stitchBatch([{ scene_id: 1 }, { scene_id: 2 }], {
      ffmpeg: "E:\\OFFLINE AI\\ffmpeg\\bin\\ffmpeg.exe",
    });
    expect(bat).toContain(">>concat.txt echo file 'scene_01.mp4'");
    expect(bat).toContain(">>concat.txt echo file 'scene_02.mp4'");
    expect(bat).toContain(
      '"E:\\OFFLINE AI\\ffmpeg\\bin\\ffmpeg.exe" -y -f concat -safe 0 -i concat.txt -c copy assembled_visuals.mp4',
    );
    expect(bat).toContain(
      "-i assembled_visuals.mp4 -i suno_track.mp3 -c:v copy -c:a aac -shortest final_master_music_video.mp4",
    );
    expect(bat).toContain("\r\n");
  });
});

describe("Ollama NDJSON streaming", () => {
  it("joins tokens split across chunks", async () => {
    const enc = new TextEncoder();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            new ReadableStream({
              start(c) {
                [
                  '{"message":{"content":"Hel"}}\n{"mess',
                  'age":{"content":"lo"}}\n{"done":true}',
                ].forEach((s) => c.enqueue(enc.encode(s)));
                c.close();
              },
            }),
          ),
      ),
    );
    const got: string[] = [];
    expect(
      await streamOllama({
        baseUrl: "http://127.0.0.1:11434",
        model: "qwen2.5:14b",
        messages: [],
        onToken: (t) => got.push(t),
      }),
    ).toBe("Hello");
    expect(got).toEqual(["Hel", "lo"]);
  });
  it("explains a missing model", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ error: "model 'phi4:14b' not found" }, { status: 404 })),
    );
    await expect(
      streamOllama({ baseUrl: "http://x", model: "phi4:14b", messages: [], onToken: () => {} }),
    ).rejects.toThrow("ollama pull phi4:14b");
  });
});

describe("tiers, Suno status and ComfyUI completion", () => {
  it("tier defaults: Ultra uses 14B/12B, Handheld 7B/8B", () => {
    expect(TIER_DEFAULTS.ultra).toMatchObject({
      lyric: "qwen2.5:14b",
      director: "mistral-nemo:12b",
    });
    expect(TIER_DEFAULTS.handheld).toMatchObject({ lyric: "qwen2.5:7b", director: "hermes3:8b" });
  });
  it("finds task ids in common provider replies", () => {
    expect(sunoTaskId({ code: 200, data: { taskId: "abc" } })).toBe("abc");
    expect(sunoTaskId({ clips: [{ id: "c1" }] })).toBe("c1");
    expect(sunoTaskId({ id: 42 })).toBe("42");
    expect(sunoTaskId("nope")).toBeNull();
  });
  it("finds audio urls", () => {
    expect(
      sunoAudioUrls('{"audio_url":"https://cdn.x/a.mp3?t=1","other":"https://y/b.wav"}'),
    ).toEqual(["https://cdn.x/a.mp3?t=1", "https://y/b.wav"]);
  });
  it("detects a finished ComfyUI prompt", () => {
    expect(comfyFinished({ p1: { outputs: { "21": { videos: [] } } } }, "p1")).toBe(true);
    expect(comfyFinished({}, "p1")).toBe(false);
  });
  it("parses the revised scene schema", () => {
    const [s] = parseStoryboard(
      '[{"time_range":"x","lyric_sync":"[Intro]","action_description":"car drifts","diffusion_prompt":"car"}]',
      5,
    );
    expect(s).toMatchObject({
      time_range: "00:00 - 00:05",
      lyric_sync: "[Intro]",
      action_description: "car drifts",
    });
  });
});
