import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Brand } from "@/components/studio/Brand";
import { workspace } from "@/lib/workspace";

beforeEach(() => workspace._reset());
afterEach(() => cleanup());

describe("Theme & Brand", () => {
  it("offers the OG BOT preset first and shows a live sample", () => {
    render(<Brand />);
    const presets = screen.getAllByRole("button").filter((b) => /OG BOT|OG Cyber|Royal/.test(b.textContent ?? ""));
    expect(presets[0]!.textContent).toContain("OG BOT");
    fireEvent.click(presets[0]!);
    expect(workspace.get().files["styles.css"]).toContain("#5b47e0");
    expect(screen.getByLabelText("Theme sample")).toHaveStyle({ background: "#0b0d1f" });
  });
  it("fonts are shown in their own face", () => {
    render(<Brand />);
    const serif = screen.getByRole("radio", { name: /Serif/ });
    expect(serif.querySelector("span")!.getAttribute("style")).toContain("Georgia");
    fireEvent.click(serif);
    expect(workspace.get().files["styles.css"]).toContain("Georgia");
  });
});
