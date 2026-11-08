import { useEffect, useState } from "react";
import { Panel, Bar, Stat } from "./ui";
import { OLLAMA_MODELS } from "@/lib/ollama";

// Your local Ollama models plus the image/audio engines. vram = GB needed incl. ~1.5 GB working memory.
export const MODELS = [
  ...OLLAMA_MODELS.map((m) => ({ name: `${m.label} (${m.tag})`, vram: Math.round((m.gb + 1.5) * 10) / 10 })),
  { name: "SDXL Turbo Image Checkpoint", vram: 8 },
  { name: "AudioCraft MusicGen Medium", vram: 6 },
];
// RTX 5080 (16 GB) in an AOOSTAR AG03 dock over Thunderbolt/USB4, on a GPD Pocket 4.
const TOTAL = 16;

export function Hardware() {
  const [s, setS] = useState({ gpu: 34, vram: 6.1, cpu: 22, ram: 41, temp: 58 });
  useEffect(() => {
    const id = setInterval(() => {
      const j = (v: number, d: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v + (Math.random() - 0.5) * d));
      setS((p) => ({ gpu: j(p.gpu, 14, 5, 99), vram: j(p.vram, 0.6, 2, TOTAL), cpu: j(p.cpu, 10, 3, 95), ram: j(p.ram, 4, 20, 90), temp: j(p.temp, 3, 40, 85) }));
    }, 1000);
    return () => clearInterval(id);
  }, []);
  const tone = (v: number): "destructive" | "warning" | "primary" => (v > 85 ? "destructive" : v > 65 ? "warning" : "primary");

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="GPU" value={`${s.gpu.toFixed(0)}%`} sub="RTX 5080 eGPU (sim)" />
        <Stat label="VRAM" value={`${s.vram.toFixed(1)} GB`} sub={`of ${TOTAL} GB`} />
        <Stat label="CPU" value={`${s.cpu.toFixed(0)}%`} sub="Ryzen AI 9 HX 370 · 24 threads" />
        <Stat label="RAM" value={`${s.ram.toFixed(0)}%`} sub="32 GB" />
        <Stat label="GPU Temp" value={`${s.temp.toFixed(0)}°C`} />
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="Live Load">
          <div className="space-y-3 text-xs">
            {([["GPU", s.gpu], ["VRAM", (s.vram / TOTAL) * 100], ["CPU", s.cpu], ["RAM", s.ram]] as const).map(([k, v]) => (
              <div key={k}><div className="mb-1 flex justify-between font-mono"><span>{k}</span><span>{v.toFixed(0)}%</span></div><Bar value={v} tone={tone(v)} /></div>
            ))}
          </div>
        </Panel>
        <Panel title="Model Compatibility">
          <ul className="space-y-2 text-xs">
            {MODELS.map((m) => {
              const fits = m.vram <= TOTAL;
              return (
                <li key={m.name} className="flex items-center justify-between rounded border border-border bg-card px-3 py-2 font-mono">
                  <span>{m.name}</span>
                  <span className="text-muted-foreground">{m.vram} GB</span>
                  <span className={fits ? "text-primary" : "text-destructive"}>{fits ? "COMPATIBLE" : "NEEDS MORE VRAM"}</span>
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
