import { useRef, useState } from "react";
import { Play, Square } from "lucide-react";
import { Panel, Btn, inputCls } from "./ui";
import { usage } from "@/lib/usage";

type Track = { name: string; notes: number[]; bpm: number };
const SCALES: Record<string, number[]> = {
  Synthwave: [220, 261.6, 293.7, 329.6, 392, 440],
  Lofi: [196, 233.1, 261.6, 293.7, 349.2],
  Cyberpunk: [110, 130.8, 146.8, 164.8, 196, 220],
};

export function Music() {
  const [prompt, setPrompt] = useState("neon night drive");
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
    <div className="grid gap-3 lg:grid-cols-2">
      <Panel title="AI Music & Audio Studio">
        <div className="space-y-3">
          <label className="block text-xs text-muted-foreground">Prompt<input className={inputCls} value={prompt} onChange={(e) => setPrompt(e.target.value)} /></label>
          <div className="flex gap-2">{Object.keys(SCALES).map((k) => <Btn key={k} variant={style === k ? "blue" : "ghost"} onClick={() => setStyle(k)}>{k}</Btn>)}</div>
          <Btn onClick={gen} className="w-full">Compose Track</Btn>
          <p className="text-xs text-muted-foreground">Tracks are synthesized on-device in your browser.</p>
        </div>
      </Panel>
      <Panel title="Player">
        {tracks.length === 0 ? <p className="text-sm text-muted-foreground">Compose a track to play it.</p> : (
          <ul className="space-y-2">
            {tracks.map((t, i) => (
              <li key={i} className="rounded border border-border bg-card p-2">
                <div className="flex items-center gap-2">
                  <button aria-label={playing === i ? "Stop" : "Play"} onClick={() => (playing === i ? stop() : play(i))} className="rounded-full bg-primary p-2 text-primary-foreground">
                    {playing === i ? <Square className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                  </button>
                  <div className="flex-1 text-sm">{t.name}<div className="font-mono text-[10px] text-muted-foreground">{t.bpm} BPM · {t.notes.length} steps</div></div>
                </div>
                <div className="mt-2 flex h-8 items-end gap-px">
                  {t.notes.map((f, n) => <div key={n} className={playing === i ? "flex-1 bg-primary animate-pulse" : "flex-1 bg-secondary/70"} style={{ height: `${(f / 440) * 100}%` }} />)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
