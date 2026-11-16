import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { blockInner, moveBlockTo, parseBlocks, replaceBlock, wrapBlock } from "@/lib/web-blocks";
import { Preview } from "@/components/studio/Preview";
import { workspace } from "@/lib/workspace";

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
  workspace._reset();
});

const page = `<h1>top</h1>\n${wrapBlock("hero", "<p>A</p>")}\n${wrapBlock("features", "<p>B</p>")}\n${wrapBlock("footer", "<p>C</p>")}\n<!-- tail -->`;

describe("section blocks", () => {
  it("moves a section to any position, keeping the rest of the page", () => {
    const out = moveBlockTo(page, 0, 2);
    expect(parseBlocks(out).map((b) => b.id)).toEqual(["features", "footer", "hero"]);
    expect(out.startsWith("<h1>top</h1>")).toBe(true);
    expect(out.endsWith("<!-- tail -->")).toBe(true);
    expect(moveBlockTo(page, 1, 1)).toBe(page);
  });
  it("edits one section's HTML", () => {
    const out = replaceBlock(page, 1, "<p>NEW</p>");
    expect(blockInner(parseBlocks(out)[1]!.full)).toBe("<p>NEW</p>");
    expect(parseBlocks(out).map((b) => b.id)).toEqual(["hero", "features", "footer"]);
  });
});

describe("Build preview", () => {
  it("Publish opens a guided sheet and hands the target to Build & Publish", async () => {
    const onPublish = vi.fn();
    render(<Preview onPublish={onPublish} />);
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: /Publish/ }));
    expect(screen.getByRole("dialog", { name: "Publish" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: /Android app/ }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(onPublish).toHaveBeenCalled();
    expect(sessionStorage.getItem("og-publish-target")).toBe("android");
  });
  it("offers rotate and a custom width", async () => {
    render(<Preview />);
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "Custom width" }));
    expect(screen.getByLabelText("Custom width in pixels")).toHaveValue(1024);
    expect(screen.getByRole("button", { name: "Rotate" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Tablet" }));
    expect(screen.getByRole("button", { name: "Rotate" })).not.toBeDisabled();
  });
});
