import { act, cleanup, render, screen } from "@testing-library/react";
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
    expect(await screen.findByText(/isn't reachable at/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /run full pipeline/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /copy batch script/i })).toBeInTheDocument();
    expect(document.body.textContent).toContain(">>concat.txt echo file 'scene_02.mp4'");
    expect(screen.getByRole("checkbox", { name: "Scene 2 rendered" })).toBeInTheDocument();
  });
});
