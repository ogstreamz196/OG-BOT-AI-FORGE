/**
 * Real client hardware detection using browser APIs where available:
 *  - WebGPU (`navigator.gpu`) adapter info for GPU vendor/architecture
 *  - WebGL `WEBGL_debug_renderer_info` as a fallback GPU name
 *  - `navigator.deviceMemory` (Chromium; rounded and capped at 8 GB by spec)
 *  - `navigator.hardwareConcurrency` for CPU threads
 * Browsers never expose VRAM, so it is estimated from the GPU name and can be
 * overridden by the user via a VRAM profile.
 */

export type HardwareInfo = {
  gpuName: string | null;
  gpuVendor: string | null;
  gpuArch: string | null;
  webgpu: boolean;
  /** Detected via WebGPU or WebGL; null when nothing is exposed (e.g. SSR, jsdom). */
  source: "webgpu" | "webgl" | null;
  /** GB from navigator.deviceMemory; browsers cap this at 8. */
  ramGB: number | null;
  threads: number | null;
  /** VRAM estimate from the GPU name, in GB. */
  vramEstimateGB: number | null;
  maxBufferMB: number | null;
};

type GPUAdapterLike = {
  info?: { vendor?: string; architecture?: string; device?: string; description?: string };
  requestAdapterInfo?: () => Promise<{
    vendor?: string;
    architecture?: string;
    device?: string;
    description?: string;
  }>;
  limits?: { maxBufferSize?: number };
};
type NavLike = {
  gpu?: { requestAdapter: (o?: unknown) => Promise<GPUAdapterLike | null> };
  deviceMemory?: number;
  hardwareConcurrency?: number;
};

// Ordered most-specific first. Values are the card's VRAM in GB.
const VRAM_TABLE: [RegExp, number][] = [
  [/5090/, 32],
  [/4090|3090|7900\s*xtx/i, 24],
  [/7900\s*xt\b/i, 20],
  [/5080|4080|5070\s*ti|4070\s*ti\s*super|7800\s*xt|a4000/i, 16],
  [/4070|3080\s*ti|5070|3060(?!\s*ti)|6700\s*xt|7700\s*xt/i, 12],
  [/3080/, 10],
  [/4060\s*ti|3070|3060\s*ti|4060|3050|6600|7600|2080|2070|2060\s*super|arc\s*a7/i, 8],
  [/2060|1660|1060/, 6],
  [/intel|iris|uhd|radeon\(tm\)\s*graphics|vega/i, 2],
];

export function estimateVram(name: string | null | undefined): number | null {
  if (!name) return null;
  for (const [re, gb] of VRAM_TABLE) if (re.test(name)) return gb;
  return null;
}

function webglRenderer(): string | null {
  if (typeof document === "undefined") return null;
  try {
    const c = document.createElement("canvas");
    const gl = (c.getContext("webgl2") || c.getContext("webgl")) as WebGLRenderingContext | null;
    if (!gl) return null;
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const r = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    return typeof r === "string" && r ? r : null;
  } catch {
    return null;
  }
}

/** Strip ANGLE wrapping, e.g. "ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0, D3D11)". */
export function cleanRenderer(r: string): string {
  const m = r.match(/^ANGLE \((.*)\)$/);
  if (!m) return r.trim();
  const parts = m[1]!.split(/,\s*/);
  const name = parts[1] ?? parts[0]!;
  return name
    .replace(/\s+\(0x[0-9a-f]+\)/i, "")
    .replace(/\s+(Direct3D|OpenGL|Vulkan|Metal).*$/i, "")
    .trim();
}

export async function detectHardware(
  nav: NavLike | undefined = typeof navigator === "undefined"
    ? undefined
    : (navigator as unknown as NavLike),
): Promise<HardwareInfo> {
  const out: HardwareInfo = {
    gpuName: null,
    gpuVendor: null,
    gpuArch: null,
    webgpu: false,
    source: null,
    ramGB: typeof nav?.deviceMemory === "number" ? nav.deviceMemory : null,
    threads: typeof nav?.hardwareConcurrency === "number" ? nav.hardwareConcurrency : null,
    vramEstimateGB: null,
    maxBufferMB: null,
  };
  if (!nav) return out;

  if (nav.gpu) {
    try {
      const adapter = await nav.gpu.requestAdapter({ powerPreference: "high-performance" });
      if (adapter) {
        out.webgpu = true;
        out.source = "webgpu";
        const info = adapter.info ?? (await adapter.requestAdapterInfo?.()) ?? {};
        out.gpuVendor = info.vendor || null;
        out.gpuArch = info.architecture || null;
        out.gpuName = info.description || info.device || null;
        if (adapter.limits?.maxBufferSize)
          out.maxBufferMB = Math.round(adapter.limits.maxBufferSize / 2 ** 20);
      }
    } catch {
      /* WebGPU blocked or unavailable — fall through to WebGL */
    }
  }

  if (!out.gpuName) {
    const r = webglRenderer();
    if (r) {
      out.gpuName = cleanRenderer(r);
      out.source ??= "webgl";
    }
  }
  if (!out.gpuName && out.gpuVendor)
    out.gpuName = [out.gpuVendor, out.gpuArch].filter(Boolean).join(" ");
  out.vramEstimateGB = estimateVram(out.gpuName);
  return out;
}

export type ModelReq = { name: string; vram: number; ram: number; fallback: string | null };
export type Fit = { status: "fits" | "fallback" | "no"; note: string };

/** Decide whether a model fits a VRAM budget, considering detected RAM when the browser reports it below the cap. */
export function checkModel(m: ModelReq, vramGB: number, ramGB: number | null): Fit {
  // deviceMemory is capped at 8, so only a value below 8 is a reliable "too little RAM" signal.
  const ramShort = ramGB !== null && ramGB < 8 && ramGB < m.ram;
  if (m.vram <= vramGB && !ramShort) return { status: "fits", note: "COMPATIBLE" };
  const why = m.vram > vramGB ? "NEEDS MORE VRAM" : "NEEDS MORE RAM";
  return m.fallback
    ? { status: "fallback", note: `${why} → ${m.fallback}` }
    : { status: "no", note: why };
}
