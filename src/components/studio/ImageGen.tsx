import { useState } from "react";
import { Panel, Btn, Bar, inputCls } from "./ui";

type Img = { prompt: string; seed: number; hue: number };

function Art({ seed, hue }: { seed: number; hue: number }) {
  const r = (n: number) => ((Math.sin(seed * 9301 + n * 49297) + 1) / 2);
  return (
    <svg viewBox="0 0 100 100" className="aspect-square w-full rounded border border-border">
      <rect width="100" height="100" fill={`hsl(${hue} 50% 8%)`} />
      {Array.from({ length: 14 }, (_, i) => (
        <circle key={i} cx={r(i) * 100} cy={r(i + 50) * 100} r={4 + r(i + 99) * 22} fill={`hsl(${(hue + i * 25) % 360} 90% 55%)`} opacity={0.35} />
      ))}
      <path d={`M0 ${70 + r(3) * 10} Q50 ${40 + r(4) * 30} 100 ${70 + r(5) * 10} V100 H0Z`} fill={`hsl(${hue} 80% 15%)`} />
    </svg>
  );
}

export function ImageGen() {
  const [prompt, setPrompt] = useState("cyber city at dusk");
  const [steps, setSteps] = useState(25);
  const [p, setP] = useState(-1);
  const [imgs, setImgs] = useState<Img[]>([]);

  const gen = () => {
    setP(0);
    let i = 0;
    const id = setInterval(() => {
      i++;
      setP((i / steps) * 100);
      if (i >= steps) {
        clearInterval(id);
        setImgs((x) => [{ prompt, seed: Math.random() * 1000, hue: Math.floor(Math.random() * 360) }, ...x]);
        setP(-1);
      }
    }, 60);
  };

  return (
    <div className="grid gap-3 lg:grid-cols-[320px_1fr]">
      <Panel title="Local Image Generation">
        <div className="space-y-3">
          <label className="block text-xs text-muted-foreground">Prompt<textarea rows={3} className={inputCls} value={prompt} onChange={(e) => setPrompt(e.target.value)} /></label>
          <label className="block text-xs text-muted-foreground">Steps: {steps}<input type="range" min={10} max={50} value={steps} onChange={(e) => setSteps(+e.target.value)} className="w-full accent-primary" /></label>
          <div className="font-mono text-xs text-muted-foreground">Model: og-diffusion-xl-lite · 512×512</div>
          <Btn onClick={gen} disabled={p >= 0} className="w-full">{p >= 0 ? "Denoising…" : "Generate"}</Btn>
          {p >= 0 && <Bar value={p} />}
        </div>
      </Panel>
      <Panel title="Gallery">
        {imgs.length === 0 ? <p className="text-sm text-muted-foreground">Generated images appear here.</p> : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {imgs.map((m, i) => (
              <figure key={i}><Art seed={m.seed} hue={m.hue} /><figcaption className="mt-1 truncate text-xs text-muted-foreground">{m.prompt}</figcaption></figure>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
