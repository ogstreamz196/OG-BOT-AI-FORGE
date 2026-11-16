import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KIT_VERSION, SetupChecklist, SetupGuide } from "@/components/studio/SetupGuide";
import { driveLink } from "@/lib/drive-link";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const status = (over: Record<string, unknown> = {}) => ({
  ok: true, version: "1.0.0", tier: "ultra", online: true, public_url: null, registered: true,
  hardware: { gpu: "RTX 5080", vram_gb: 16, rtx5080: true },
  services: { ollama: true, comfyui: false }, ...over,
});

describe("Setup checklist", () => {
  it("knows the newest kit version", () => expect(KIT_VERSION).toMatch(/^\d+\.\d+\.\d+$/));

  it("ticks what the drive reports and explains what's left", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    vi.spyOn(driveLink, "get").mockReturnValue({ mode: "local", base: "http://127.0.0.1:11500", status: status() as never, message: "" });
    render(<SetupChecklist />);
    await act(async () => {});
    expect(screen.getByText("Drive plugged in here").previousSibling).toHaveAttribute("aria-label", "done");
    expect(screen.getByText("Paired for remote access").previousSibling).toHaveAttribute("aria-label", "done");
    // Old kit → asks for a fresh download
    expect(screen.getByText(/Drive kit up to date \(1.0.0\)/).previousSibling).toHaveAttribute("aria-label", "to do");
    expect(screen.getByText(/replace the files on the drive/)).toBeInTheDocument();
    expect(screen.getByText(/Dock the laptop to the RTX 5080/)).toBeInTheDocument();
  });

  it("long sections start folded", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    render(<SetupGuide />);
    await act(async () => {});
    const kit = screen.getByText(/Drive kit · plug in and go/).closest("details")!;
    expect(kit).not.toHaveAttribute("open");
  });
});
