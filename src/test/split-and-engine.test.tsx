import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SplitView, SPLIT_MIN_WIDTH } from "@/components/studio/SplitView";
import { ctxLabel, factsFrom } from "@/lib/engine-status";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("SplitView window picker", () => {
  it("switches between Chat, Split and Preview, keeping both panes mounted and remembering the choice", async () => {
    render(<SplitView id="t" left={<div>CHAT PANE</div>} right={<div>PREVIEW PANE</div>} />);
    await act(async () => {});
    expect(screen.getByRole("tab", { name: /split/i })).toHaveAttribute("aria-selected", "true");
    fireEvent.click(screen.getByRole("tab", { name: /preview/i }));
    expect(screen.getByText("CHAT PANE")).toBeInTheDocument(); // still mounted, just hidden
    expect(screen.getByLabelText("Chat")).toHaveClass("hidden");
    expect(JSON.parse(localStorage.getItem("og-split-t")!).mode).toBe("right");
    fireEvent.click(screen.getByRole("tab", { name: /chat/i }));
    expect(screen.getByLabelText("Preview")).toHaveClass("hidden");
  });
  it("needs room for Split", () => expect(SPLIT_MIN_WIDTH).toBeGreaterThanOrEqual(700));
});

describe("engine badge facts", () => {
  it("reads parameter size and the running context from Ollama", () => {
    const show = {
      details: { parameter_size: "14.8B" },
      model_info: { "qwen2.context_length": 32768 },
    };
    const ps = { models: [{ name: "qwen2.5-coder:14b", context_length: 16384 }] };
    expect(factsFrom(show, ps, "qwen2.5-coder:14b")).toEqual({
      params: "14.8B",
      context: 16384,
      loaded: true,
    });
    expect(factsFrom(show, { models: [] }, "qwen2.5-coder:14b")).toEqual({
      params: "14.8B",
      context: 32768,
      loaded: false,
    });
    expect(ctxLabel(16384)).toBe("16k ctx");
  });
});
