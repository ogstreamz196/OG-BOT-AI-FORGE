import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { modelReadiness } from "@/lib/image-gen";
import { creationUrl, gallery } from "@/lib/gallery";
import { ImageGen } from "@/components/studio/ImageGen";
import { driveLink } from "@/lib/drive-link";

afterEach(() => {
  cleanup();
  localStorage.clear();
  gallery.clear();
  vi.restoreAllMocks();
});

describe("image model readiness", () => {
  it("names the exact missing files and folders (Z-Image Turbo case)", () => {
    const fam = modelReadiness({ checkpoints: ["sdxl.safetensors"], unets: [], clips: ["clip_l.safetensors"], vaes: [] });
    expect(fam.find((f) => f.id === "sdxl")!.ready).toBe(true);
    const z = fam.find((f) => f.id === "zimage")!;
    expect(z.missing).toEqual([
      { file: "z_image_turbo_bf16.safetensors", folder: "diffusion_models" },
      { file: "qwen_3_4b.safetensors", folder: "text_encoders" },
      { file: "ae.safetensors", folder: "vae" },
    ]);
    const flux = fam.find((f) => f.id === "flux")!;
    expect(flux.missing.map((m) => m.folder)).toEqual(["diffusion_models", "text_encoders", "vae"]);
  });
  it("all ready when the files are there", () => {
    const fam = modelReadiness({ checkpoints: [], unets: ["flux1-dev.safetensors", "z_image_turbo_bf16.safetensors"], clips: ["t5xxl_fp8.safetensors", "clip_l.safetensors", "qwen_3_4b.safetensors"], vaes: ["ae.safetensors"] });
    expect(fam.filter((f) => f.ready).map((f) => f.id)).toEqual(["flux", "zimage"]);
  });
});

describe("gallery", () => {
  it("loads images through the current engine address", () => {
    const url = creationUrl({ id: "1", kind: "image", prompt: "p", url: "http://old/view", seed: 1, createdAt: 1, img: { filename: "a.png", subfolder: "", type: "output" } });
    expect(url).toMatch(/\/view\?filename=a.png&subfolder=&type=output$/);
  });
  it("syncs with the drive both ways", async () => {
    vi.spyOn(driveLink, "get").mockReturnValue({ mode: "remote", base: "https://d.example", status: null, message: "" });
    const calls: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (u, init) => {
      calls.push(`${init?.method ?? "GET"} ${String(u)} ${String(init?.body ?? "")}`);
      return new Response(JSON.stringify({ items: [{ id: "remote1", kind: "image", prompt: "from phone", url: "x", seed: 2, createdAt: 5 }] }));
    });
    gallery.add([{ kind: "image", prompt: "local", url: "y", seed: 3 }]);
    expect(await gallery.syncFromDrive()).toBe(1);
    expect(gallery.get().map((c) => c.prompt)).toContain("from phone");
    expect(calls.some((c) => c.startsWith("POST https://d.example/og/gallery") && c.includes("local"))).toBe(true);
  });
});

describe("Image Studio screen", () => {
  it("explains the offline engine in plain words", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    render(<ImageGen />);
    await act(async () => {});
    expect(await screen.findByText("The image engine is off.")).toBeInTheDocument();
    expect(screen.queryByText(/enable-cors-header/)).not.toBeInTheDocument();
  });
});
