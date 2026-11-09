import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Agent } from "@/components/studio/Agent";
import { Workbench } from "@/components/studio/Workbench";

Element.prototype.scrollIntoView = () => {};
afterEach(() => { cleanup(); localStorage.clear(); vi.useRealTimers(); });

describe("saved history", () => {
  it("agent chat survives a remount (page reload)", async () => {
    vi.useFakeTimers();
    const first = render(<Agent />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "/git-push" } });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    await act(async () => { vi.advanceTimersByTime(2000); });
    expect(screen.getByText("Push complete.")).toBeInTheDocument();
    first.unmount();
    render(<Agent />);
    await act(async () => {});
    expect(screen.getByText("you ❯").parentElement).toHaveTextContent("/git-push");
    expect(screen.getByText("Push complete.")).toBeInTheDocument();
  });

  it("workbench code edits survive a remount", async () => {
    const first = render(<Workbench />);
    await act(async () => {});
    fireEvent.change(document.querySelector("textarea")!, { target: { value: "<h1>SAVED</h1>" } });
    first.unmount();
    render(<Workbench />);
    await act(async () => {});
    expect(document.querySelector("textarea")!.value).toBe("<h1>SAVED</h1>");
  });

  it("leaving the agent tab doesn't crash when scrollIntoView returns a Promise (new Chrome)", async () => {
    Element.prototype.scrollIntoView = (() => Promise.resolve()) as unknown as Element["scrollIntoView"];
    const view = render(<Agent />);
    await act(async () => {});
    expect(() => view.unmount()).not.toThrow();
    Element.prototype.scrollIntoView = () => {};
  });
});
