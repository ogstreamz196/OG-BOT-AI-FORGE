import { useState } from "react";
import { Sparkles, Image as ImageIcon, Music2, Clapperboard, Wand2, Loader2, Zap } from "lucide-react";
import { Btn, inputCls } from "./ui";
import { cn } from "@/lib/utils";
import { connectors } from "@/lib/connectors";
import { quickChat } from "@/lib/local-ai";
import { models } from "@/lib/models";
import { classifyCreation, creationRouterPrompt, parseCreation, type CreationKind } from "@/lib/creation";
import { ImageGen } from "./ImageGen";
import { Music } from "./Music";
import { MusicVideo } from "./MusicVideo";

type Mode = "auto" | CreationKind;

const MODES: { id: Mode; label: string; icon: typeof ImageIcon }[] = [
  { id: "auto", label: "Auto", icon: Zap },
  { id: "image", label: "Image", icon: ImageIcon },
  { id: "song", label: "Song", icon: Music2 },
  { id: "video", label: "Video", icon: Clapperboard },
];

const KIND_LABEL: Record<CreationKind, string> = { image: "Image", song: "Song", video: "Video" };
const KIND_ICON: Record<CreationKind, typeof ImageIcon> = {
  image: ImageIcon,
  song: Music2,
  video: Clapperboard,
};

const EXAMPLES = [
  "a neon samurai in the rain, cinematic",
  "a lofi beat for late-night coding",
  "a 60-second synthwave music video about a desert road trip",
  "a minimalist logo for a coffee brand called OROVA",
];

export function Create() {
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState<Mode>("auto");
  const [routed, setRouted] = useState<{ kind: CreationKind; prompt: string; byAi: boolean } | null>(
    null,
  );
  const [routing, setRouting] = useState(false);
  const [enhancing, setEnhancing] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const ollama = connectors.isEnabled("ollama") ? connectors.configOf("ollama")["baseUrl"] : null;

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
      if (!ollama) setNote("Enable Ollama (Connectors) for AI enhancement.");
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
      const line = text.split("\n").map((l) => l.trim()).find(Boolean);
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
    setRouted({ kind, prompt: text, byAi });
    setRouting(false);
  };

  const ActiveIcon = routed ? KIND_ICON[routed.kind] : Sparkles;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {/* Prompt bar */}
      <div className="rounded-2xl border border-border bg-panel/80 p-3 backdrop-blur">
        <div className="mb-2 flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-primary">
            <Sparkles className="h-4 w-4" />
          </span>
          <div className="font-display text-sm uppercase">Create anything</div>
          <span className="ml-auto font-mono text-[10px] text-muted-foreground">
            {ollama ? "AI routing on" : "offline routing"}
          </span>
        </div>

        <textarea
          rows={2}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void create();
            }
          }}
          placeholder="Describe an image, a song, or a video…"
          className={cn(inputCls, "resize-y text-sm leading-relaxed")}
        />

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <div className="flex gap-1">
            {MODES.map((m) => {
              const Icon = m.icon;
              return (
                <button
                  key={m.id}
                  onClick={() => setMode(m.id)}
                  className={cn(
                    "flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] transition",
                    mode === m.id
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-border bg-card text-muted-foreground hover:border-primary",
                  )}
                >
                  <Icon className="h-3 w-3" />
                  {m.label}
                </button>
              );
            })}
          </div>
          <button
            onClick={() => void enhance()}
            disabled={enhancing || !prompt.trim()}
            className="flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[11px] text-primary transition hover:border-primary disabled:opacity-40"
          >
            {enhancing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
            Enhance
          </button>
          <Btn onClick={() => void create()} disabled={routing || !prompt.trim()} className="ml-auto">
            {routing ? (
              <Loader2 className="mr-1 inline h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-1 inline h-4 w-4" />
            )}
            Create
          </Btn>
        </div>

        {!routed && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                onClick={() => setPrompt(ex)}
                className="rounded-full border border-border bg-card/40 px-2.5 py-1 text-[11px] text-muted-foreground transition hover:border-primary hover:text-primary"
              >
                {ex}
              </button>
            ))}
          </div>
        )}
        {note && <div className="mt-2 font-mono text-[11px] text-destructive">{note}</div>}
      </div>

      {/* Routed engine */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {routed ? (
          <>
            <div className="mb-3 flex items-center gap-2 rounded-xl border border-primary/40 bg-primary/5 px-3 py-2 text-xs">
              <ActiveIcon className="h-4 w-4 text-primary" />
              <span className="text-foreground">
                {routed.byAi ? "AI routed this to" : "Creating a"}{" "}
                <span className="font-semibold text-primary">{KIND_LABEL[routed.kind]}</span>
              </span>
              <span className="truncate font-mono text-[11px] text-muted-foreground">
                · “{routed.prompt}”
              </span>
            </div>
            {routed.kind === "image" && <ImageGen key={routed.prompt} initialPrompt={routed.prompt} />}
            {routed.kind === "song" && <Music key={routed.prompt} initialPrompt={routed.prompt} />}
            {routed.kind === "video" && (
              <MusicVideo key={routed.prompt} initialPrompt={routed.prompt} />
            )}
          </>
        ) : (
          <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
            <Sparkles className="h-8 w-8 opacity-30" />
            <p>One prompt → image, song, or video.</p>
            <p className="text-xs">
              Leave it on <span className="text-primary">Auto</span> and the AI picks the right
              studio, or choose a mode yourself.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
