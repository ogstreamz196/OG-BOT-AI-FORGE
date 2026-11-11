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
