import { useEffect, useState } from "react";
import { Panel, Bar, Stat } from "./ui";
import { checkModel, detectHardware, type HardwareInfo } from "@/lib/hardware";
import { useDriveLink } from "@/lib/drive-link";

// Mirrors MODEL_MATRIX in the repo's dashboard/compatibility-checker.js
export const MODELS = [
  { name: "Qwen 2.5 Coder 32B (Q4_K_M)", vram: 12, ram: 16, fallback: "qwen2.5-coder:14b" },
  { name: "DeepSeek R1 32B Reasoning", vram: 14, ram: 32, fallback: "deepseek-r1:14b" },
  { name: "Qwen 2.5 Coder 14B", vram: 8, ram: 16, fallback: "qwen2.5-coder:7b" },
  { name: "Qwen 2.5 Coder 7B", vram: 5, ram: 8, fallback: "qwen2.5-coder:1.5b" },
  { name: "Qwen 2.5 Coder 1.5B (Autocomplete)", vram: 1.5, ram: 4, fallback: null },
  { name: "SDXL Turbo Image Checkpoint", vram: 8, ram: 16, fallback: "sd-1.5" },
  { name: "AudioCraft MusicGen Medium", vram: 6, ram: 16, fallback: "musicgen-small" },
];
// Default VRAM ceiling: RTX 5080 eGPU profile.
const DEFAULT_VRAM = 16;
const PROFILES = [4, 6, 8, 12, 16, 24, 32];

type Live = {
  gpu: { gpu_pct: number; vram_used_gb: number; vram_total_gb: number; temp_c: number } | null;
  cpu_pct: number | null;
  ram_pct: number | null;
  ram_gb: number | null;
  models: { name: string; vram_gb: number }[];
};

/** Real load from the drive every 2 s (null when the drive isn't reachable). */
function useLiveLoad(): Live | null {
  const d = useDriveLink();
  const base = d.mode === "local" || d.mode === "remote" ? d.base : null;
  const [live, setLive] = useState<Live | null>(null);
  useEffect(() => {
    if (!base) {
      setLive(null);
      return;
    }
    let stop = false;
    const tick = async () => {
      try {
        const r = await fetch(`${base}/og/live`);
        if (!r.ok) throw new Error(String(r.status));
        const j = (await r.json()) as Omit<Live, "models">;
        let models: Live["models"] = [];
        try {
          const ps = (await (await fetch(`${base}/ollama/api/ps`)).json()) as { models?: { name: string; size_vram?: number }[] };
          models = (ps.models ?? []).map((m) => ({ name: m.name, vram_gb: (m.size_vram ?? 0) / 2 ** 30 }));
        } catch {
          /* engine not running yet */
        }
        if (!stop) setLive({ ...j, models });
      } catch {
        if (!stop) setLive(null);
      }
    };
    void tick();
    const id = setInterval(() => void tick(), 2000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [base]);
  return live;
}

function DriveScan() {
  const d = useDriveLink();
  const hw = d.status?.hardware;
  return (
    <Panel
      title="Drive hardware scan"
      right={<span className="font-mono text-[10px] text-muted-foreground">{d.message}</span>}
    >
      {hw ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat
            label="GPU"
            value={
              hw.rtx5080 ? "RTX 5080" : hw.gpu ? hw.gpu.replace("NVIDIA GeForce ", "") : "None"
            }
            sub={hw.gpu ? `${hw.vram_gb} GB VRAM` : "eGPU not connected"}
          />
          <Stat
            label="Tier"
            value={d.status!.tier === "ultra" ? "Docked Ultra" : "Handheld"}
            sub={`models up to ${hw.max_params_b ?? (d.status!.tier === "ultra" ? 14 : 8)}B`}
          />
          <Stat label="RAM" value={hw.ram_gb ? `${hw.ram_gb} GB` : "?"} sub={hw.cpu || ""} />
          <Stat
            label="Engines"
            value={`${d.status!.services.ollama ? "Ollama ✓" : "Ollama ✗"}`}
            sub={d.status!.services.comfyui ? "ComfyUI ✓" : "ComfyUI off"}
          />
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Plug in the drive (or start launch-hub.bat). Its server scans the hardware at start-up and
          picks the tier: RTX 5080 found → Docked Ultra (14B models), otherwise Handheld (7–8B).
        </p>
      )}
    </Panel>
  );
}

export function Hardware() {
  const [hw, setHw] = useState<HardwareInfo | null>(null);
  const [override, setOverride] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    detectHardware()
      .then((h) => live && setHw(h))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  const TOTAL = override ?? hw?.vramEstimateGB ?? DEFAULT_VRAM;
  const vramSource = override
    ? "manual profile"
    : hw?.vramEstimateGB
      ? "estimated from GPU"
      : "RTX 5080 eGPU profile";

  const live = useLiveLoad();
  const g = live?.gpu ?? null;
  const vramTotal = g?.vram_total_gb ?? TOTAL;
  const pct = (v: number | null | undefined) => (v == null ? "—" : `${v.toFixed(0)}%`);
  const tone = (v: number): "destructive" | "warning" | "primary" =>
    v > 85 ? "destructive" : v > 65 ? "warning" : "primary";

  return (
    <div className="space-y-3">
      <DriveScan />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="GPU" value={pct(g?.gpu_pct)} sub={g ? "live from the drive" : (hw?.gpuName ?? "Detecting…")} />
        <Stat
          label="VRAM"
          value={g ? `${g.vram_used_gb.toFixed(1)} GB` : "—"}
          sub={`of ${vramTotal} GB · ${g ? "live" : vramSource}`}
        />
        <Stat
          label="CPU"
          value={pct(live?.cpu_pct)}
          sub={hw?.threads ? `${hw.threads} threads` : "threads unknown"}
        />
        <Stat
          label="RAM"
          value={pct(live?.ram_pct)}
          sub={live?.ram_gb ? `of ${live.ram_gb} GB` : hw?.ramGB ? `${hw.ramGB >= 8 ? "≥8" : hw.ramGB} GB` : "not reported"}
        />
        <Stat label="GPU Temp" value={g ? `${g.temp_c.toFixed(0)}°C` : "—"} />
      </div>
      <Panel
        title="Detected Device"
        right={
          <label className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
            VRAM profile
            <select
              aria-label="VRAM profile"
              value={override ?? ""}
              onChange={(e) => setOverride(e.target.value ? Number(e.target.value) : null)}
              className="rounded border border-border bg-background px-2 py-1 text-xs text-foreground"
            >
              <option value="">Auto ({hw?.vramEstimateGB ?? DEFAULT_VRAM} GB)</option>
              {PROFILES.map((p) => (
                <option key={p} value={p}>
                  {p} GB
                </option>
              ))}
            </select>
          </label>
        }
      >
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-xs md:grid-cols-4">
          {(
            [
              ["GPU", hw?.gpuName ?? (hw ? "Not exposed by browser" : "Detecting…")],
              ["Vendor / Arch", [hw?.gpuVendor, hw?.gpuArch].filter(Boolean).join(" · ") || "—"],
              ["WebGPU", hw ? (hw.webgpu ? "AVAILABLE" : "UNAVAILABLE") : "…"],
              ["Max GPU buffer", hw?.maxBufferMB ? `${hw.maxBufferMB} MB` : "—"],
            ] as const
          ).map(([k, v]) => (
            <div key={k} className="min-w-0">
              <dt className="text-[10px] uppercase tracking-widest text-muted-foreground">{k}</dt>
              <dd
                className={
                  k === "WebGPU" && hw?.webgpu ? "text-primary" : "truncate text-foreground"
                }
                title={v}
              >
                {v}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-[11px] text-muted-foreground">
          The live gauges come from the drive (nvidia-smi, CPU and memory counters). Without the
          drive, VRAM is estimated from the GPU name (override above).
        </p>
      </Panel>
      <div className="grid gap-3 lg:grid-cols-2">
        <Panel
          title="Live load"
          right={<span className="font-mono text-[10px] text-muted-foreground">{live ? "from the drive · every 2 s" : "drive not connected"}</span>}
        >
          {live ? (
            <div className="space-y-3 text-xs">
              {(
                [
                  ["GPU", g?.gpu_pct],
                  ["VRAM", g ? (g.vram_used_gb / g.vram_total_gb) * 100 : null],
                  ["CPU", live.cpu_pct],
                  ["RAM", live.ram_pct],
                ] as const
              ).map(([k, v]) => (
                <div key={k}>
                  <div className="mb-1 flex justify-between font-mono">
                    <span>{k}</span>
                    <span>{v == null ? (k === "GPU" || k === "VRAM" ? "no NVIDIA GPU" : "—") : `${v.toFixed(0)}%`}</span>
                  </div>
                  <Bar value={v ?? 0} tone={tone(v ?? 0)} />
                </div>
              ))}
              <div className="border-t border-border pt-2">
                <p className="mb-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Loaded in memory now</p>
                {live.models.length ? (
                  <ul className="space-y-1 font-mono">
                    {live.models.map((m) => (
                      <li key={m.name} className="flex justify-between gap-2">
                        <span className="truncate">{m.name}</span>
                        <span className="text-muted-foreground">{m.vram_gb.toFixed(1)} GB in VRAM</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted-foreground">No model loaded. The first message loads one (takes a few seconds).</p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Plug in the drive (or sign in as D.EV to reach it remotely) to see real GPU, VRAM, CPU and RAM load here.</p>
          )}
        </Panel>
        <Panel title="Model Compatibility">
          <ul className="space-y-2 text-xs">
            {MODELS.map((m) => {
              const fit = checkModel(m, TOTAL, hw?.ramGB ?? null);
              return (
                <li
                  key={m.name}
                  className="flex flex-wrap items-center justify-between gap-x-3 rounded border border-border bg-card px-3 py-2 font-mono"
                >
                  <span>{m.name}</span>
                  <span className="text-muted-foreground">{m.vram} GB</span>
                  <span
                    className={
                      fit.status === "fits"
                        ? "text-primary"
                        : fit.status === "fallback"
                          ? "text-warning"
                          : "text-destructive"
                    }
                  >
                    {fit.note}
                  </span>
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
