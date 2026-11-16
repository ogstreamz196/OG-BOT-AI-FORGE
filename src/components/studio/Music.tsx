import { useRef, useState } from "react";
import { Play, Square } from "lucide-react";
import { Panel, Btn, inputCls } from "./ui";
import { usage } from "@/lib/usage";
import { openTool } from "@/lib/open-tool";

type Track = { name: string; notes: number[]; bpm: number };
const SCALES: Record<string, number[]> = {
  Synthwave: [220, 261.6, 293.7, 329.6, 392, 440],
  Lofi: [196, 233.1, 261.6, 293.7, 349.2],
  Cyberpunk: [110, 130.8, 146.8, 164.8, 196, 220],
};

export function Music({ initialPrompt }: { initialPrompt?: string } = {}) {
  const [prompt, setPrompt] = useState(initialPrompt?.trim() || "neon night drive");
  const [style, setStyle] = useState("Synthwave");
  const [tracks, setTracks] = useState<Track[]>([]);
  const [playing, setPlaying] = useState<number | null>(null);
  const ctx = useRef<AudioContext | null>(null);
  const stopT = useRef<number | null>(null);

  const gen = () => {
    const s = SCALES[style] ?? [220];
    const notes = Array.from({ length: 32 }, () => s[Math.floor(Math.random() * s.length)] ?? 220);
    setTracks((t) => [{ name: `${prompt} (${style})`, notes, bpm: 100 + Math.floor(Math.random() * 40) }, ...t]);
    usage.record("music");
  };

  const stop = () => {
    ctx.current?.close();
    ctx.current = null;
    if (stopT.current) clearTimeout(stopT.current);
    setPlaying(null);
  };

  const play = (i: number) => {
    stop();
    const ac = new AudioContext();
    ctx.current = ac;
    const tr = tracks[i];
    if (!tr) return;
    const step = 60 / tr.bpm / 2;
    tr.notes.forEach((f, n) => {
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = style === "Lofi" ? "triangle" : "sawtooth";
      o.frequency.value = f;
      const t = ac.currentTime + n * step;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.15, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + step * 0.95);
      o.connect(g).connect(ac.destination);
      o.start(t);
      o.stop(t + step);
    });
    setPlaying(i);
    stopT.current = window.setTimeout(stop, tr.notes.length * step * 1000 + 200);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-3">
      <Panel title="Beat sketchpad" right={<span className="font-mono text-[10px] text-muted-foreground">in your browser · instant</span>}>
        <div className="space-y-3">
          <p className="rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
            A quick melody idea from a scale, played by your browser. It isn't an AI song: for real vocals and production, write the lyrics in Music Video Studio and send them to Suno.
            <button onClick={() => openTool("musicvideo")} className="ml-1 font-semibold text-primary hover:underline">
              Open Music Video Studio →
            </button>
          </p>
          <label className="block text-xs text-muted-foreground">
            Name your idea
            <input className={inputCls} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
          </label>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Style">
            {Object.keys(SCALES).map((k) => (
              <Btn key={k} variant={style === k ? "blue" : "ghost"} onClick={() => setStyle(k)}>
                {k}
              </Btn>
            ))}
          </div>
          <Btn onClick={gen} className="og-gradient w-full">Sketch a melody</Btn>
        </div>
      </Panel>
      {tracks.length > 0 && (
        <Panel title="Your sketches">
          <ul className="space-y-2">
            {tracks.map((t, i) => (
              <li key={i} className="rounded-lg border border-border bg-card p-2">
                <div className="flex items-center gap-2">
                  <button aria-label={playing === i ? "Stop" : "Play"} onClick={() => (playing === i ? stop() : play(i))} className="og-gradient rounded-full p-2 text-primary-foreground">
                    {playing === i ? <Square className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                  </button>
                  <div className="min-w-0 flex-1 text-sm">
                    <span className="block truncate">{t.name}</span>
                    <span className="font-mono text-[10px] text-muted-foreground">{t.bpm} BPM · {t.notes.length} steps</span>
                  </div>
                </div>
                <div className="mt-2 flex h-8 items-end gap-px" aria-hidden>
                  {t.notes.map((f, n) => (
                    <div key={n} className={playing === i ? "flex-1 animate-pulse bg-primary" : "flex-1 bg-secondary/70"} style={{ height: `${(f / 440) * 100}%` }} />
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
