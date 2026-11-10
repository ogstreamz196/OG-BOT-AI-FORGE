import { describe, expect, it } from "vitest";
import {
  parseDirectorJSON,
  directorPrompt,
  comfyWorkflow,
  concatScript,
  pickDirectorModel,
  scenePromptsText,
  type DirectorOutput,
} from "@/lib/music-video";

const SAMPLE = {
  suno_config: {
    style_prompt: "synthwave, 110bpm, analog pads",
    lyrics: "[Verse]\nneon\n[Chorus]\ndrive",
  },
  storyboard: [
    {
      scene_id: 1,
      start_sec: 0,
      end_sec: 30,
      lyric_cue: "[Verse]",
      visual_prompt: "neon city",
      camera_motion: "pan-left",
    },
    {
      scene_id: 2,
      start_sec: 30,
      end_sec: 60,
      lyric_cue: "[Chorus]",
      visual_prompt: "car on highway",
      camera_motion: "dolly",
    },
  ],
};

describe("parseDirectorJSON", () => {
  it("parses plain JSON", () => {
    const out = parseDirectorJSON(JSON.stringify(SAMPLE))!;
    expect(out.suno_config.style_prompt).toMatch(/synthwave/);
    expect(out.storyboard).toHaveLength(2);
    expect(out.storyboard[0]!.camera_motion).toBe("pan-left");
  });
  it("parses fenced JSON with prose and coerces numbers", () => {
    const text =
      'Here you go:\n```json\n{"suno_config":{"style_prompt":"x","lyrics":"y"},"storyboard":[{"scene_id":1,"start_sec":"0","end_sec":"15","lyric_cue":"a","visual_prompt":"b","camera_motion":"zoom-in"}]}\n```';
    const out = parseDirectorJSON(text)!;
    expect(out.storyboard[0]!.end_sec).toBe(15);
  });
  it("rejects junk / empty storyboard", () => {
    expect(parseDirectorJSON("no json")).toBeNull();
    expect(parseDirectorJSON('{"suno_config":{},"storyboard":[]}')).toBeNull();
  });
});

describe("directorPrompt", () => {
  it("includes concept + strict JSON schema", () => {
    const p = directorPrompt({ genre: "dnb", theme: "rain", bpm: 174, durationSec: 60 });
    expect(p).toMatch(/dnb/);
    expect(p).toMatch(/suno_config/);
    expect(p).toMatch(/storyboard/);
  });
});

describe("comfyWorkflow", () => {
  it("maps a scene's visual prompt into the graph", () => {
    const g = comfyWorkflow(SAMPLE.storyboard[0]!) as Record<
      string,
      { class_type: string; inputs: Record<string, unknown> }
    >;
    expect(g["6"]!.inputs["text"]).toBe("neon city");
    expect(g["9"]!.class_type).toBe("SaveImage");
  });
});

describe("concatScript", () => {
  it("writes timed entries and repeats the last file", () => {
    const s = concatScript(SAMPLE as DirectorOutput);
    expect(s).toMatch(/file 'mv_scene_1.png'/);
    expect(s).toMatch(/duration 30/);
    expect((s.match(/mv_scene_2.png/g) || []).length).toBe(2); // last repeated
  });
});

describe("pickDirectorModel", () => {
  it("prefers mistral-nemo then qwen2.5:14b", () => {
    expect(pickDirectorModel(["llama3.2:1b", "qwen2.5:14b", "mistral-nemo:12b"])).toBe(
      "mistral-nemo:12b",
    );
    expect(pickDirectorModel(["llama3.2:1b", "qwen2.5:14b"])).toBe("qwen2.5:14b");
  });
  it("skips embeddings as fallback", () => {
    expect(pickDirectorModel(["nomic-embed-text", "llama3.2:3b"])).toBe("llama3.2:3b");
  });
});

describe("scenePromptsText", () => {
  it("lists scenes with timing and camera", () => {
    expect(scenePromptsText(SAMPLE as DirectorOutput)).toMatch(/Scene 1 \(0-30s\) \[pan-left\]/);
  });
});
