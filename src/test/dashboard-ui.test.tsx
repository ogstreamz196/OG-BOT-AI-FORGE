import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Dashboard } from "@/components/studio/Dashboard";
import { GitSync, ago, whoMade } from "@/components/studio/GitSync";
import { Hardware } from "@/components/studio/Hardware";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("Dashboard tabs", () => {
  it("opens on Overview with health cards and switches tabs, remembering the choice", async () => {
    const onOpen = vi.fn();
    render(<Dashboard onOpen={onOpen} />);
    await act(async () => {});
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("AI engine")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Change history/ }));
    expect(onOpen).toHaveBeenCalledWith("git");
    fireEvent.click(screen.getByRole("tab", { name: "OG BOT repairs" }));
    expect(screen.getByText("OG BOT self-repair")).toBeInTheDocument();
    expect(localStorage.getItem("og-dash-tab")).toBe("repair");
    fireEvent.click(screen.getByRole("tab", { name: "Features" }));
    expect(screen.getByText(/Feature Permissions/)).toBeInTheDocument();
    expect(screen.queryByText("OG BOT self-repair")).not.toBeInTheDocument();
  });
});

describe("Change history", () => {
  it("names who made each change", () => {
    expect(whoMade("OG BOT", "OG BOT autofix: x")).toBe("OG BOT");
    expect(whoMade("gpt-engineer-app[bot]", "Changes")).toBe("gpt-engineer-app[bot]");
    expect(whoMade("lovable-dev[bot]", "x")).toBe("Lovable");
    expect(whoMade("Claude", "x")).toBe("Claude");
  });
  it("says how long ago", () => {
    expect(ago(1000, 1030)).toBe("just now");
    expect(ago(1000, 1000 + 600)).toBe("10 min ago");
    expect(ago(0, 7200)).toBe("2 h ago");
    expect(ago(0, 86400 * 3)).toBe("3 d ago");
  });
  it("asks for the drive instead of showing made-up commits", () => {
    render(<GitSync />);
    expect(screen.getByText(/Plug in the drive/)).toBeInTheDocument();
    expect(screen.queryByText(/Faiyaz/)).not.toBeInTheDocument();
  });
});

describe("Hardware live load", () => {
  it("never shows simulated numbers without the drive", async () => {
    render(<Hardware />);
    await act(async () => {});
    expect(screen.queryByText(/simulated/i)).not.toBeInTheDocument();
    expect(screen.getAllByText(/drive not connected/i).length).toBeGreaterThan(0);
  });
});

describe("audit fixes", () => {
  it("Hardware lists the real roster, nothing over 14B", async () => {
    render(<Hardware />);
    await act(async () => {});
    expect(screen.getByText("Qwen 2.5 Coder 14B · lead coder (docked)")).toBeInTheDocument();
    expect(screen.queryByText(/32B/)).not.toBeInTheDocument();
  });
  it("chat commands that aren't wired say so instead of pretending", async () => {
    const { slashReply } = await import("@/components/studio/Agent");
    expect(slashReply("/git-push")!.join(" ")).toMatch(/Nothing was committed/);
    expect(slashReply("/export-apk")!.join(" ")).toMatch(/Build & Publish/);
    expect(slashReply("/git-push")!.join(" ")).not.toMatch(/Push complete/);
  });
  it("Engine Test starts on the default coder and the drive-routed address", async () => {
    Element.prototype.scrollIntoView ??= () => {};
    const { OllamaTester } = await import("@/components/studio/OllamaTester");
    render(<OllamaTester />);
    await act(async () => {});
    expect(screen.getByLabelText("Model")).toHaveValue("qwen2.5-coder:14b");
    expect(screen.getByLabelText("Server URL")).toHaveValue("http://127.0.0.1:11434");
  });
});

describe("Hardware with the drive", () => {
  it("shows live numbers and hides the browser's own GPU guess", async () => {
    const { driveLink } = await import("@/lib/drive-link");
    vi.spyOn(driveLink, "get").mockReturnValue({ mode: "local", base: "http://127.0.0.1:11500", status: null, message: "" });
    vi.spyOn(globalThis, "fetch").mockImplementation(async (u) =>
      new Response(
        JSON.stringify(
          String(u).endsWith("/og/live")
            ? { gpu: { gpu_pct: 40, vram_used_gb: 8, vram_total_gb: 16, temp_c: 60 }, cpu_pct: 10, ram_pct: 30, ram_gb: 32 }
            : { models: [] },
        ),
      ),
    );
    render(<Hardware />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(await screen.findByText("60°C")).toBeInTheDocument();
    expect(screen.queryByText("Detected Device")).not.toBeInTheDocument();
  });
});

describe("OG BOT's powers in the repairs tab", () => {
  it("shows powers and read-only instructions with an Edit button", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    render(<Dashboard />);
    await act(async () => {});
    fireEvent.click(screen.getByRole("tab", { name: "OG BOT repairs" }));
    expect(screen.getByText("OG BOT's powers")).toBeInTheDocument();
    expect(screen.getByText("How OG BOT builds")).toBeInTheDocument();
    expect(screen.queryByLabelText("OG BOT's instructions")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit instructions" })).toBeInTheDocument();
  });
});

describe("header engine badge", () => {
  it("says the engine is off in plain words and opens Engine Test", async () => {
    const { EngineBadge } = await import("@/components/studio/EngineBadge");
    const { engineStatus } = await import("@/lib/engine-status");
    const { OPEN_TOOL_EVENT } = await import("@/lib/open-tool");
    vi.spyOn(engineStatus, "get").mockReturnValue({ online: false, host: "x", model: "qwen2.5-coder:14b", facts: {} });
    const opened = vi.fn();
    window.addEventListener(OPEN_TOOL_EVENT, (e) => opened((e as CustomEvent).detail));
    render(<EngineBadge />);
    const b = screen.getByRole("button", { name: /Engine off · tap to fix/ });
    fireEvent.click(b);
    expect(opened).toHaveBeenCalledWith("ollama");
  });
});
