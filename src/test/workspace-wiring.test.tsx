import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { slashReply } from "@/components/studio/Agent";
import { Workbench, zipProject } from "@/components/studio/Workbench";
import { planEdit } from "@/lib/agent-edits";
import { BLANK, buildDoc, workspace } from "@/lib/workspace";
import { checkModel, cleanRenderer, detectHardware, estimateVram } from "@/lib/hardware";

beforeEach(() => {
  workspace._reset();
  // jsdom has no canvas/WebGL; behave like a browser that exposes none.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});

describe("agent ↔ workbench wiring", () => {
  it("/scaffold creates and opens a project in the shared workspace", () => {
    slashReply("/scaffold demo");
    expect(workspace.get().project).toBe("demo");
    expect(workspace.get().files["index.html"]).toBe(BLANK["index.html"]);
    expect(workspace.projectNames()).toContain("demo");
  });

  it("/scaffold <name> hub uses the hub starter template", () => {
    slashReply("/scaffold mine hub");
    expect(workspace.get().files["index.html"]).toMatch(/OG-BOT HUB/);
  });

  it("/edit mutates files and the mounted Workbench re-renders", () => {
    slashReply("/scaffold demo");
    render(<Workbench />);
    act(() => {
      slashReply('/edit title "Neon Lab"');
    });
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toContain(
      "<h1>Neon Lab</h1>",
    );
  });
});

describe("planEdit", () => {
  it("adds a dark mode toggle once", () => {
    const r = planEdit(BLANK, "dark mode toggle");
    expect(r.ok).toBe(true);
    expect(r.patch["app.js"]).toContain("og-dark-toggle");
    expect(planEdit({ ...BLANK, ...r.patch }, "dark mode").patch).toEqual({});
  });
  it("replaces literal text in an explicit file", () => {
    const r = planEdit(BLANK, 'index.html replace "Tap me" with "Go"');
    expect(Object.keys(r.patch)).toEqual(["index.html"]);
    expect(r.patch["index.html"]).toContain(">Go</button>");
  });
  it("sets background colour", () => {
    expect(planEdit(BLANK, "background #0a0e17").patch["styles.css"]).toMatch(
      /body\{background:#0a0e17/,
    );
  });
  it("unmatched instruction leaves a TODO and reports not ok", () => {
    const r = planEdit(BLANK, "app.js add a login screen");
    expect(r.ok).toBe(false);
    expect(r.patch["app.js"]).toContain("/* TODO(agent): add a login screen */");
  });
});

describe("export", () => {
  it("buildDoc keeps $ sequences in user code intact", () => {
    const html =
      '<html><head><link rel="stylesheet" href="styles.css"></head><body><script src="app.js"></script></body></html>';
    expect(
      buildDoc({ "index.html": html, "styles.css": "", "app.js": "x.replace(/a/, '$&$1')" }),
    ).toContain("'$&$1'");
  });
  it("zip contains every project file plus a single-file bundle", async () => {
    const zip = await zipProject("demo", BLANK);
    expect(
      Object.keys(zip.files)
        .filter((f) => !f.endsWith("/"))
        .sort(),
    ).toEqual(["demo/app.js", "demo/bundle.html", "demo/index.html", "demo/styles.css"]);
    const index = await zip.file("demo/index.html")!.async("string");
    expect(index).toMatch(/<link rel="stylesheet" href="styles.css">/);
    expect(index).toMatch(/<script src="app.js"><\/script>/);
  });
});

describe("hardware detection", () => {
  it("reads WebGPU adapter info, RAM and threads", async () => {
    const hw = await detectHardware({
      deviceMemory: 8,
      hardwareConcurrency: 24,
      gpu: {
        requestAdapter: async () => ({
          info: {
            vendor: "nvidia",
            architecture: "blackwell",
            description: "NVIDIA GeForce RTX 5080",
          },
          limits: { maxBufferSize: 2 ** 31 },
        }),
      },
    });
    expect(hw).toMatchObject({
      webgpu: true,
      source: "webgpu",
      ramGB: 8,
      threads: 24,
      vramEstimateGB: 16,
      maxBufferMB: 2048,
    });
  });
  it("handles a browser with no GPU APIs", async () => {
    const hw = await detectHardware({ hardwareConcurrency: 4 });
    expect(hw.webgpu).toBe(false);
    expect(hw.threads).toBe(4);
  });
  it("estimates VRAM and cleans ANGLE renderer strings", () => {
    expect(estimateVram("NVIDIA GeForce RTX 4090")).toBe(24);
    expect(estimateVram("NVIDIA GeForce RTX 3060 Ti")).toBe(8);
    expect(estimateVram("NVIDIA GeForce RTX 3060")).toBe(12);
    expect(
      cleanRenderer(
        "ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 (0x00002786) Direct3D11 vs_5_0 ps_5_0, D3D11)",
      ),
    ).toBe("NVIDIA GeForce RTX 4070");
  });
  it("checkModel suggests fallbacks", () => {
    const m = { name: "x", vram: 14, ram: 32, fallback: "deepseek-r1:14b" };
    expect(checkModel(m, 16, 8).status).toBe("fits");
    expect(checkModel(m, 12, 8)).toEqual({
      status: "fallback",
      note: "NEEDS MORE VRAM → deepseek-r1:14b",
    });
    expect(checkModel(m, 16, 4).note).toMatch(/RAM/);
  });
});
