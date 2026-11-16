import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Create } from "@/components/studio/Create";
import { buildHandoff } from "@/lib/build-handoff";
import { gallery } from "@/lib/gallery";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  gallery.clear();
});

describe("Create screen", () => {
  it("explains engine state in plain words and hints each mode", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    render(<Create />);
    await act(async () => {});
    expect(screen.getByText("AI engine offline: plug in the drive")).toBeInTheDocument();
    expect(screen.getByText(/Images and video need the drive docked/)).toBeInTheDocument();
    expect(screen.queryByText("no LLM")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: /Image/ }));
    expect(screen.getByText(/a picture made with ComfyUI/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enhance" })).toBeDisabled();
  });

  it("example cards fill the prompt; a website goes to Build", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    const send = vi.spyOn(buildHandoff, "send").mockImplementation(() => {});
    render(<Create />);
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: /landing page for a coffee brand/ }));
    expect(screen.getByLabelText("Describe what to create")).toHaveValue("a landing page for a coffee brand called OROVA");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Create$/ }));
    });
    expect(send).toHaveBeenCalledWith("a landing page for a coffee brand called OROVA");
  });

  it("shows recent creations", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    gallery.add([{ kind: "image", prompt: "red fox", url: "data:image/png;base64,", seed: 1 }]);
    render(<Create />);
    await act(async () => {});
    expect(screen.getByRole("region", { name: "Recent creations" })).toBeInTheDocument();
    expect(screen.getByAltText("red fox")).toBeInTheDocument();
  });
});
