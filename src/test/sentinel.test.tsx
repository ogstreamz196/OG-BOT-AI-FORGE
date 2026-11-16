import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Sentinel, sentinelState } from "@/components/studio/Sentinel";
import { driveLink } from "@/lib/drive-link";

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});

const id = { serial: "1A2B-3C4D", label: "OGDRIVE", total_gb: 1000, free_gb: 400, kit: "1.2.0" };

describe("USB Sentinel", () => {
  it("decides from the real serial", () => {
    expect(sentinelState(null, "")).toBe("no-drive");
    expect(sentinelState(id, "")).toBe("unbound");
    expect(sentinelState(id, "1A2B-3C4D")).toBe("ok");
    expect(sentinelState(id, "FFFF-0000")).toBe("wrong");
  });
  it("reads the drive and locks to it", async () => {
    vi.spyOn(driveLink, "get").mockReturnValue({ mode: "local", base: "http://127.0.0.1:11500", status: null, message: "" });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(id)));
    render(<Sentinel />);
    await act(async () => {});
    expect(screen.getByText("1A2B-3C4D")).toBeInTheDocument();
    expect(screen.getByText("400 GB free of 1000 GB")).toBeInTheDocument();
    expect(screen.queryByText(/Simulate/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Lock to this drive/ }));
    expect(screen.getByText("Your drive · locked to it")).toBeInTheDocument();
  });
});
