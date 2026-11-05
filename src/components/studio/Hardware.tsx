import { useEffect, useState } from "react";
import { Panel, Bar, Stat } from "./ui";

const MODELS = [
  { name: "og-coder-7b Q4", vram: 5.2 },
  { name: "og-coder-14b Q4", vram: 9.8 },
  { name: "og-diffusion-xl-lite", vram: 6.5 },
  { name: "og-music-small", vram: 3.1 },
  { name: "og-coder-34b Q4", vram: 21 },
];
const TOTAL = 12;

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
        <Stat label="GPU" value={`${s.gpu.toFixed(0)}%`} sub="RTX 4070 (sim)" />
        <Stat label="VRAM" value={`${s.vram.toFixed(1)} GB`} sub={`of ${TOTAL} GB`} />
        <Stat label="CPU" value={`${s.cpu.toFixed(0)}%`} sub="16 threads" />
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
