import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { modelJobs, parsePullLine, pullModel, removeModel, sameTag } from "@/lib/model-manager";
import { models } from "@/lib/models";
import { Settings } from "@/components/studio/Settings";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  models._reset();
});

const stream = (lines: string[]) =>
  new Response(new ReadableStream({ start(c) { lines.forEach((l) => c.enqueue(new TextEncoder().encode(l + "\n"))); c.close(); } }));

describe("model manager", () => {
  it("reads pull progress", () => {
    expect(parsePullLine('{"status":"pulling","total":200,"completed":50}')).toEqual({ status: "pulling", pct: 25 });
    expect(parsePullLine('{"error":"no space"}')).toMatchObject({ status: "failed", error: "no space" });
    expect(parsePullLine("not json")).toBeNull();
    expect(sameTag("phi4", "phi4:latest")).toBe(true);
  });

  it("refuses models over 14B without asking the drive", async () => {
    const f = vi.spyOn(globalThis, "fetch");
    expect(await pullModel("qwen2.5-coder:32b")).toBe(false);
    expect(f).not.toHaveBeenCalled();
    expect(modelJobs.get()["qwen2.5-coder:32b"]?.error).toMatch(/14B/);
  });

  it("installs with progress, then refreshes the installed list", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) =>
      String(url).endsWith("/api/pull")
        ? stream(['{"status":"pulling","total":10,"completed":5}', '{"status":"success"}'])
        : new Response(JSON.stringify({ models: [{ name: "phi4:14b" }] })),
    );
    expect(await pullModel("phi4:14b")).toBe(true);
    expect(models.get().live).toEqual(["phi4:14b"]);
    expect(modelJobs.get()["phi4:14b"]).toBeUndefined();
  });

  it("reports a failed removal", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 500 }));
    expect(await removeModel("phi4:14b")).toBe(false);
    expect(modelJobs.get()["phi4:14b"]?.status).toBe("failed");
  });
});

describe("Settings", () => {
  it("falls back to marking by hand when the engine is offline", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    render(<Settings />);
    await act(async () => {});
    expect(screen.getByText("engine offline")).toBeInTheDocument();
    expect(screen.getAllByText("Mark installed").length).toBeGreaterThan(0);
  });
  it("offers Install and Remove when the drive answers", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ models: [{ name: "qwen2.5-coder:14b" }] })));
    render(<Settings />);
    await act(async () => {});
    expect(screen.getByText("1 installed")).toBeInTheDocument();
    expect(screen.getByLabelText(/Remove Qwen 2.5 Coder 14B/)).toBeInTheDocument();
    expect(screen.getAllByText("Install").length).toBeGreaterThan(5);
  });
});
