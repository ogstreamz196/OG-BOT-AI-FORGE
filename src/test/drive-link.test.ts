import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sb = vi.hoisted(() => ({
  token: null as string | null,
  row: null as null | { url: string; updated_at: string },
}));
vi.mock("@/lib/supabase", () => ({
  hasSupabase: true,
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: sb.token ? { access_token: sb.token } : null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
    from: () => ({ select: () => ({ maybeSingle: async () => ({ data: sb.row, error: null }) }) }),
    rpc: async () => ({ data: "k".repeat(64), error: null }),
  },
}));

import {
  isManagedUrl,
  resolveDrive,
  routesFor,
  installDriveFetch,
  LOCAL_DRIVE,
} from "@/lib/drive-link";
import { connectors } from "@/lib/connectors";

const STATUS = {
  ok: true,
  version: "1",
  tier: "ultra",
  hardware: { gpu: "NVIDIA GeForce RTX 5080", vram_gb: 15.9, rtx5080: true, tier: "ultra" },
  services: { ollama: true, comfyui: false },
  online: true,
  public_url: "https://a-b.trycloudflare.com",
  registered: true,
};
const json = (b: unknown) =>
  new Response(JSON.stringify(b), { headers: { "Content-Type": "application/json" } });

beforeEach(() => {
  connectors._reset();
  sb.token = null;
  sb.row = null;
});
afterEach(() => vi.unstubAllGlobals());

describe("drive link", () => {
  it("routes through the drive server when it's found, else straight to local engines", () => {
    expect(routesFor({ mode: "local", base: LOCAL_DRIVE })).toEqual({
      ollama: `${LOCAL_DRIVE}/ollama`,
      comfyui: `${LOCAL_DRIVE}/comfy`,
    });
    expect(routesFor({ mode: "none", base: null }).ollama).toBe("http://127.0.0.1:11434");
  });
  it("only rewrites addresses it manages, never one you typed", () => {
    expect(isManagedUrl("http://127.0.0.1:11434")).toBe(true);
    expect(isManagedUrl("https://x-y.trycloudflare.com/ollama")).toBe(true);
    expect(isManagedUrl("http://192.168.1.20:11434")).toBe(false);
  });
  it("finds the drive on this computer and points Ollama/ComfyUI at it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (u: string) =>
        u.startsWith(LOCAL_DRIVE) ? json(STATUS) : Promise.reject(new TypeError("x")),
      ),
    );
    const l = await resolveDrive();
    expect(l.mode).toBe("local");
    expect(l.status?.hardware.rtx5080).toBe(true);
    expect(connectors.configOf("ollama")["baseUrl"]).toBe(`${LOCAL_DRIVE}/ollama`);
  });
  it("reaches the drive remotely with the D.EV token when it's elsewhere", async () => {
    sb.token = "tok";
    sb.row = { url: "https://a-b.trycloudflare.com", updated_at: new Date().toISOString() };
    const f = vi.fn(async (u: string, init?: RequestInit) => {
      if (
        u.startsWith("https://a-b.trycloudflare.com") &&
        (init?.headers as Record<string, string>)?.["Authorization"] === "Bearer tok"
      )
        return json(STATUS);
      throw new TypeError("unreachable");
    });
    vi.stubGlobal("fetch", f);
    const l = await resolveDrive();
    expect(l.mode).toBe("remote");
    expect(connectors.configOf("comfyui")["baseUrl"]).toBe("https://a-b.trycloudflare.com/comfy");
  });
  it("says when the drive is offline", async () => {
    sb.token = "tok";
    sb.row = {
      url: "https://gone.trycloudflare.com",
      updated_at: new Date(Date.now() - 3 * 3600_000).toISOString(),
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("offline");
      }),
    );
    const l = await resolveDrive();
    expect(l.mode).toBe("none");
    expect(l.message).toMatch(/Drive offline \(last online 3 h ago\)/);
  });
  it("adds the D.EV token to every remote call", async () => {
    sb.token = "tok";
    sb.row = { url: "https://a-b.trycloudflare.com", updated_at: new Date().toISOString() };
    const seen: (string | null)[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (u: string, init?: RequestInit) => {
        if (u.startsWith(LOCAL_DRIVE) || u.startsWith("http://127.0.0.1"))
          throw new TypeError("not here");
        if (u.endsWith("/og/status")) return json(STATUS);
        seen.push(new Headers(init?.headers).get("Authorization"));
        return json({});
      }),
    );
    installDriveFetch();
    await resolveDrive();
    await window.fetch("https://a-b.trycloudflare.com/ollama/api/tags");
    expect(seen).toEqual(["Bearer tok"]);
  });
});
