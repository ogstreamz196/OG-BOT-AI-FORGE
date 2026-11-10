import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  license: null as unknown,
  usage: null as unknown,
  fail: false,
  saved: [] as unknown[],
}));

vi.mock("@/lib/studio-data", () => ({
  loadLicense: async () => { if (db.fail) throw new Error("offline"); return db.license; },
  loadUsage: async () => { if (db.fail) throw new Error("offline"); return db.usage; },
  saveLicense: async (patch: unknown) => { db.saved.push(patch); },
  bumpUsage: async () => {},
}));

import { Sentinel, isValidKey } from "@/components/studio/Sentinel";

const LICENSE = {
  id: "primary", customer: "Workstation Owner", tier: "pro", expires: "2027-11-01",
  slots: [{ slot: 1, label: "Primary Rig (RTX 5080)", mac: "C8:7F:54:1A:22:9E" }, { slot: 2, label: "Laptop", mac: null }],
  device_key: "OGB-7F3A-91C2-XQ8D", usb_serial: "USB\\OGB_SENTINEL\\0x4A91F0C2", plugged: true, activated: true, grace_days_left: 17,
};

afterEach(() => { cleanup(); db.saved = []; db.fail = false; });

describe("Sentinel tab", () => {
  it("validates licence keys", () => {
    expect(isValidKey("OGB-7F3A-91C2-XQ8D")).toBe(true);
    expect(isValidKey("nope")).toBe(false);
  });

  it("shows the saved licence and usage, and saves slot changes", async () => {
    db.license = LICENSE;
    db.usage = { prompts: 4, edits: 1, images: 0, music: 2, builds: 3, since: "2026-11-08" };
    render(<Sentinel />);
    await act(async () => {});
    expect(screen.getByText(/Pro · Workstation Owner · expires 2027-11-01 · 17 days/)).toBeInTheDocument();
    expect(screen.getByText("Usage since 2026-11-08")).toBeInTheDocument();
    expect(screen.getByText("Saved to AI FORGE OFFLINE")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Bind this device" })[0]!);
    await act(async () => {});
    expect(db.saved).toHaveLength(1);
    expect((db.saved[0] as { slots: { mac: string | null }[] }).slots[1]!.mac).toMatch(/^([0-9A-F]{2}:){5}[0-9A-F]{2}$/);
  });

  it("when offline, shows demo values and never overwrites the saved licence", async () => {
    db.fail = true;
    render(<Sentinel />);
    await act(async () => {});
    expect(screen.getByText(/showing demo values/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Simulate eject" }));
    await act(async () => {});
    expect(db.saved).toHaveLength(0);
  });
});
