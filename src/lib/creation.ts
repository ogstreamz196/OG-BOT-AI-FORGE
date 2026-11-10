/**
 * Creation router for the AIO Create studio. Decides whether a single prompt is
 * asking for an image, a song, or a video — the same pattern as the model
 * orchestrator: a deterministic classifier that always works offline, plus an
 * optional LLM route for nuance. Pure + unit-tested.
 */

export type CreationKind = "image" | "song" | "video";

export const CREATION_KINDS: readonly CreationKind[] = ["image", "song", "video"];

const VIDEO_RE =
  /\b(video|music video|clip|animation|animate|film|movie|cinematic sequence|storyboard|scene|trailer|reel|footage|mv)\b/i;
const SONG_RE =
  /\b(song|music|track|beat|audio|melody|tune|lyrics|lyric|compose|instrumental|remix|bpm|chorus|verse|synthwave|lofi)\b/i;
const IMAGE_RE =
  /\b(image|picture|photo|photograph|art|artwork|illustration|drawing|paint|render|logo|poster|wallpaper|portrait|design|icon|sketch|scene of|concept art)\b/i;

/** Deterministic intent classifier. Video wins over song wins over image on ties. */
export function classifyCreation(prompt: string): CreationKind {
  const p = prompt.toLowerCase();
  // A music video mentions both music and video — treat as video.
  if (VIDEO_RE.test(p)) return "video";
  if (SONG_RE.test(p)) return "song";
  if (IMAGE_RE.test(p)) return "image";
  // Default: most single prompts to a creative tool are picturing something.
  return "image";
}

/** Prompt handed to the router model to classify a creation request. */
export function creationRouterPrompt(prompt: string): string {
  return `You route creative requests to the right generator. Reply with ONLY a JSON object, no prose:
{"kind":"image|song|video","reason":"<max 6 words>"}

- image: a still picture, art, photo, logo, poster, design.
- song: audio only — a track, beat, melody, lyrics.
- video: moving footage, animation, or a music video.

Request: ${prompt}`;
}

/** Parse the router model's reply into a creation kind. Tolerant of prose/fences. */
export function parseCreation(text: string): CreationKind | null {
  if (!text) return null;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try {
      const obj = JSON.parse(text.slice(start, end + 1)) as { kind?: unknown };
      if (typeof obj.kind === "string") {
        const k = obj.kind.toLowerCase().trim();
        if ((CREATION_KINDS as readonly string[]).includes(k)) return k as CreationKind;
      }
    } catch {
      /* fall through */
    }
  }
  const lower = text.toLowerCase();
  for (const k of CREATION_KINDS) if (new RegExp(`\\b${k}\\b`).test(lower)) return k;
  return null;
}
