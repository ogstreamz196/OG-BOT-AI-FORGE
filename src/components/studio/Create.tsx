import { useEffect, useState } from "react";
import {
  Sparkles,
  Image as ImageIcon,
  Music2,
  Clapperboard,
  Wand2,
  Loader2,
  Zap,
  Code2,
} from "lucide-react";
import { Btn, inputCls } from "./ui";
import { cn } from "@/lib/utils";
import { connectors, useConnectors } from "@/lib/connectors";
import { buildHandoff } from "@/lib/build-handoff";
import { quickChat, pingOllama } from "@/lib/local-ai";
import { pingComfy } from "@/lib/image-gen";
import { models } from "@/lib/models";
import { creationUrl, useGallery } from "@/lib/gallery";
import {
  classifyCreation,
  creationRouterPrompt,
  parseCreation,
  type CreationKind,
} from "@/lib/creation";
import { ImageGen } from "./ImageGen";
import { Music } from "./Music";
import { MusicVideo } from "./MusicVideo";

type Mode = "auto" | CreationKind;

const MODES: { id: Mode; label: string; icon: typeof ImageIcon }[] = [
  { id: "auto", label: "Auto", icon: Zap },
  { id: "image", label: "Image", icon: ImageIcon },
  { id: "song", label: "Song", icon: Music2 },
  { id: "video", label: "Video", icon: Clapperboard },
  { id: "build", label: "Website", icon: Code2 },
];

const KIND_LABEL: Record<CreationKind, string> = {
  image: "Image",
  song: "Song",
  video: "Video",
  build: "Website / app",
};
const KIND_ICON: Record<CreationKind, typeof ImageIcon> = {
  image: ImageIcon,
  song: Music2,
  video: Clapperboard,
  build: Code2,
};

const EXAMPLES: { text: string; kind: CreationKind }[] = [
  { text: "a neon samurai in the rain, cinematic", kind: "image" },
  { text: "a lofi beat for late-night coding", kind: "song" },
  { text: "a 60-second synthwave music video about a desert road trip", kind: "video" },
  { text: "a landing page for a coffee brand called OROVA", kind: "build" },
];

const MODE_HINT: Record<Mode, string> = {
  auto: "Auto: OG BOT reads your idea and opens the right studio. Websites and apps open in Build.",
  image: "Image: a picture made with ComfyUI on your RTX 5080 (a few seconds each).",
  song: "Song: lyrics and a track sketch; finish it in Music Video Studio with Suno.",
  video: "Video: lyrics, a scene-by-scene storyboard, then renders and a stitch script.",
  build: "Website / app: OG BOT builds it in Build with a live preview.",
};

export function Create() {
  useConnectors(); // re-check the engines when the drive connects (it switches them on)
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState<Mode>("auto");
  const [routed, setRouted] = useState<{
    kind: CreationKind;
    prompt: string;
    byAi: boolean;
  } | null>(null);
  const [routing, setRouting] = useState(false);
  const [enhancing, setEnhancing] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [llmCount, setLlmCount] = useState<number | null>(null);
  const [comfyOk, setComfyOk] = useState<boolean | null>(null);

  const ollama = connectors.isEnabled("ollama") ? connectors.configOf("ollama")["baseUrl"] : null;
  const comfyUrl = connectors.configOf("comfyui")["baseUrl"] ?? "http://127.0.0.1:8188";

  useEffect(() => {
    let live = true;
    if (ollama)
      void pingOllama(ollama).then((r) => {
        if (!live) return;
        setLlmCount(r.ok ? r.models.length : 0);
        if (r.ok) models.syncLive(r.models);
      });
    else setLlmCount(0);
    void pingComfy(comfyUrl).then((ok) => live && setComfyOk(ok));
    return () => {
      live = false;
    };
  }, [ollama, comfyUrl]);

  const resolveKind = async (text: string): Promise<{ kind: CreationKind; byAi: boolean }> => {
    if (mode !== "auto") return { kind: mode, byAi: false };
    // Auto: let a local model route when available; fall back to the classifier.
    if (ollama) {
      try {
        const model = models.activeTag() ?? "llama3.2:3b";
        const reply = await quickChat(ollama, model, creationRouterPrompt(text));
        const kind = parseCreation(reply);
        if (kind) return { kind, byAi: true };
      } catch {
        /* fall back */
      }
    }
    return { kind: classifyCreation(text), byAi: false };
  };

  const enhance = async () => {
    if (!ollama || !prompt.trim()) {
      if (!ollama) setNote("Enhance needs the AI engine on your drive.");
      return;
    }
    setEnhancing(true);
    setNote(null);
    try {
      const model = models.activeTag() ?? "llama3.2:3b";
      const text = await quickChat(
        ollama,
        model,
        `Rewrite this creative request into ONE vivid, detailed line (max 50 words). Output only the line, no quotes or preamble.\nRequest: ${prompt}`,
      );
      const line = text
        .split("\n")
        .map((l) => l.trim())
        .find(Boolean);
      if (line) setPrompt(line.replace(/^["'`]+|["'`]+$/g, ""));
    } catch {
      setNote("Could not enhance right now.");
    } finally {
      setEnhancing(false);
    }
  };

  const create = async () => {
    const text = prompt.trim();
    if (!text || routing) return;
    setRouting(true);
    setNote(null);
    const { kind, byAi } = await resolveKind(text);
    if (kind === "build") {
      // A website / app: OG BOT builds it in the Build view.
      setRouting(false);
      setPrompt("");
      buildHandoff.send(text);
      return;
    }
    setRouted({ kind, prompt: text, byAi });
    setRouting(false);
  };

  const ActiveIcon = routed ? KIND_ICON[routed.kind] : Sparkles;
  const recent = useGallery().slice(0, 8);
  const engineText =
    llmCount === null
      ? "Checking the AI engine…"
      : llmCount
        ? `AI engine ready · ${llmCount} model${llmCount > 1 ? "s" : ""}`
        : "AI engine offline: plug in the drive";
  const imageText =
    comfyOk === null
      ? "Checking the image engine…"
      : comfyOk
        ? "Image & video engine ready"
        : "Images and video need the drive docked to the RTX 5080";

  const composer = (
    <div
      className={cn(
        "og-hairline rounded-2xl bg-panel/80 p-3 backdrop-blur",
        !routed && "p-4 shadow-2xl shadow-black/40",
      )}
    >
      <textarea
        rows={routed ? 2 : 3}
        aria-label="Describe what to create"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void create();
          }
        }}
        placeholder="Describe an image, a song, a music video, or a website…"
        className={cn(
          inputCls,
          "resize-none border-0 bg-transparent font-sans text-base leading-relaxed focus:ring-0",
        )}
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="What to make">
          {MODES.map((m) => {
            const Icon = m.icon;
            return (
              <button
                key={m.id}
                role="radio"
                aria-checked={mode === m.id}
                onClick={() => setMode(m.id)}
                className={cn(
                  "flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs transition",
                  mode === m.id
                    ? "og-gradient border-transparent text-primary-foreground"
                    : "border-border bg-card text-muted-foreground hover:border-primary",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {m.label}
              </button>
            );
          })}
        </div>
        <button
          onClick={() => void enhance()}
          disabled={enhancing || !prompt.trim() || !llmCount}
          title={
            llmCount
              ? "Let OG BOT rewrite your idea in more detail"
              : "Needs the AI engine on your drive"
          }
          className="flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs text-primary transition hover:border-primary disabled:opacity-40"
        >
          {enhancing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Wand2 className="h-3.5 w-3.5" />
          )}
          Enhance
        </button>
        <Btn
          onClick={() => void create()}
          disabled={routing || !prompt.trim()}
          className="og-gradient ml-auto"
        >
          {routing ? (
            <Loader2 className="mr-1 inline h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="mr-1 inline h-4 w-4" />
          )}
          Create
        </Btn>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">{MODE_HINT[mode]}</p>
      {note && <div className="mt-1 text-[11px] text-destructive">{note}</div>}
    </div>
  );

  if (routed) {
    return (
      <div className="flex h-full min-h-0 flex-col gap-3">
        {composer}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mb-3 flex items-center gap-2 rounded-xl border border-primary/40 bg-primary/5 px-3 py-2 text-xs">
            <ActiveIcon className="h-4 w-4 shrink-0 text-primary" />
            <span className="shrink-0 text-foreground">
              {routed.byAi ? "OG BOT picked" : "Making a"}{" "}
              <span className="font-semibold text-primary">{KIND_LABEL[routed.kind]}</span>
            </span>
            <span className="min-w-0 truncate font-mono text-[11px] text-muted-foreground">
              · “{routed.prompt}”
            </span>
            <button
              onClick={() => setRouted(null)}
              className="ml-auto shrink-0 text-primary hover:underline"
            >
              New creation
            </button>
          </div>
          {routed.kind === "image" && (
            <ImageGen key={routed.prompt} initialPrompt={routed.prompt} />
          )}
          {routed.kind === "song" && <Music key={routed.prompt} initialPrompt={routed.prompt} />}
          {routed.kind === "video" && (
            <MusicVideo key={routed.prompt} initialPrompt={routed.prompt} />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 overflow-y-auto">
      <div className="mx-auto flex max-w-3xl flex-col gap-5 px-1 pb-8 pt-4 sm:pt-10">
        <div className="text-center">
          <p className="og-eyebrow mb-2">OFFLINE FORGE · Create</p>
          <h1 className="font-brand text-2xl font-semibold text-foreground sm:text-3xl">
            What will you create?
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            One prompt. OG BOT picks the right studio, or you choose.
          </p>
        </div>
        {composer}
        <div className="flex flex-wrap justify-center gap-2 text-[11px]">
          <span
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-3 py-1",
              llmCount ? "border-success/50 text-success" : "border-border text-muted-foreground",
            )}
          >
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                llmCount ? "bg-success" : "bg-muted-foreground",
              )}
              aria-hidden
            />
            {engineText}
          </span>
          <span
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-3 py-1",
              comfyOk ? "border-success/50 text-success" : "border-border text-muted-foreground",
            )}
          >
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                comfyOk ? "bg-success" : "bg-muted-foreground",
              )}
              aria-hidden
            />
            {imageText}
          </span>
        </div>

        <section aria-label="Ideas to try">
          <p className="og-eyebrow mb-2">Try one</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {EXAMPLES.map((ex) => {
              const Icon = KIND_ICON[ex.kind];
              return (
                <button
                  key={ex.text}
                  onClick={() => {
                    setPrompt(ex.text);
                    setMode("auto");
                  }}
                  className="og-hairline group flex items-start gap-3 rounded-xl bg-card/50 p-3 text-left transition hover:bg-primary/10"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary transition group-hover:scale-105">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                      {KIND_LABEL[ex.kind]}
                    </span>
                    <span className="text-sm text-foreground/90">{ex.text}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {recent.length > 0 && (
          <section aria-label="Recent creations">
            <p className="og-eyebrow mb-2">Recent creations</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {recent.map((c) => (
                <button
                  key={c.id}
                  onClick={() =>
                    setRouted({
                      kind: c.kind === "video" ? "video" : "image",
                      prompt: c.prompt,
                      byAi: false,
                    })
                  }
                  className="og-hairline group overflow-hidden rounded-xl bg-card text-left"
                  title={c.prompt}
                >
                  <img
                    src={creationUrl(c)}
                    alt={c.prompt}
                    loading="lazy"
                    className="aspect-square w-full object-cover transition group-hover:scale-105"
                    onError={(e) => (e.currentTarget.style.visibility = "hidden")}
                  />
                  <span className="block truncate px-2 py-1.5 text-[11px] text-muted-foreground">
                    {c.prompt}
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
