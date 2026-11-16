import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MusicVideo } from "@/components/studio/MusicVideo";

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe("Music Video Studio screen", () => {
  it("offline: shows the reconnect notice, and Stage D still builds the script from saved scenes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    localStorage.setItem(
      "og-mv-scenes",
      JSON.stringify([
        {
          scene_id: 1,
          time_range: "00:00 - 00:05",
          lyric_sync: "",
          shot_type: "wide",
          action_description: "a",
          cinematography: "",
          diffusion_prompt: "p1",
          negative_prompt: "n",
        },
        {
          scene_id: 2,
          time_range: "00:05 - 00:10",
          lyric_sync: "",
          shot_type: "close",
          action_description: "b",
          cinematography: "",
          diffusion_prompt: "p2",
          negative_prompt: "n",
        },
      ]),
    );
    render(<MusicVideo />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(await screen.findByText(/AI engine on your drive isn't answering/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /run full pipeline/i })).toBeDisabled();
    // One step at a time: saved scenes tick B; open D to get the script.
    const steps = within(screen.getByRole("navigation", { name: "Music video steps" }));
    expect(steps.getByRole("button", { name: /Lyrics/ })).toHaveAttribute("aria-current", "step");
    fireEvent.click(steps.getByRole("button", { name: /Stitch/ }));
    expect(steps.getByRole("button", { name: /Stitch/ })).toHaveAttribute("aria-current", "step");
    expect(screen.getByRole("button", { name: /copy batch script/i })).toBeInTheDocument();
    expect(document.body.textContent).toContain(">>concat.txt echo file 'scene_02.mp4'");
    fireEvent.click(steps.getByRole("button", { name: /Render/ }));
    expect(screen.getByRole("checkbox", { name: "Scene 2 rendered" })).toBeInTheDocument();
  });
});
