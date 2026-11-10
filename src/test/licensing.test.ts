import { beforeEach, describe, expect, it } from "vitest";
import { FEATURES, isLive, isUnlocked, license } from "@/lib/licensing";
import { usage } from "@/lib/usage";
import { mobileStubs } from "@/lib/mobile-stubs";
import { TEMPLATES } from "@/lib/workspace";

beforeEach(() => {
  license._reset();
  usage.reset();
});

describe("feature gating", () => {
  it("starter unlocks starter features but locks pro ones", () => {
    license.setTier("starter");
    expect(isUnlocked("code")).toBe(true);
    expect(isUnlocked("agent")).toBe(true);
    expect(isUnlocked("image")).toBe(false);
    expect(isUnlocked("music")).toBe(false);
    expect(isUnlocked("forge")).toBe(false);
  });

  it("pro unlocks everything", () => {
    license.setTier("pro");
    for (const f of FEATURES) expect(isUnlocked(f.id)).toBe(true);
  });

  it("per-feature override beats the tier default both ways", () => {
    license.setTier("starter");
    license.cycleOverride("image"); // default -> granted
    expect(isUnlocked("image")).toBe(true);
    license.cycleOverride("code"); // default -> granted
    license.cycleOverride("code"); // granted -> revoked
    expect(isUnlocked("code")).toBe(false);
    license.cycleOverride("code"); // revoked -> default
    expect(isUnlocked("code")).toBe(true);
  });
});

describe("studio live state", () => {
  it("is live when plugged and activated and unexpired", () => {
    expect(isLive(license.get())).toBe(true);
  });
  it("survives unplug while grace remains, locks when it runs out", () => {
    license.setPlugged(false);
    expect(isLive(license.get())).toBe(true);
    license.setGrace(0);
    expect(isLive(license.get())).toBe(false);
  });
  it("locks on expiry", () => {
    license.setExpires("2000-01-01");
    expect(isLive(license.get())).toBe(false);
  });
  it("activate validates the key format", () => {
    expect(license.activate("nope")).toBe(false);
    expect(license.get().activated).toBe(false);
    expect(license.activate("OGB-1234-ABCD-9999")).toBe(true);
  });
});

describe("device slots + migration", () => {
  it("binds and migrates a slot", () => {
    license.bindSlot(2);
    expect(license.get().slots.find((s) => s.slot === 2)?.mac).toBeTruthy();
    license.migrateSlot(2, "AA:BB:CC:DD:EE:FF");
    expect(license.get().slots.find((s) => s.slot === 2)?.mac).toBe("AA:BB:CC:DD:EE:FF");
  });
});

describe("usage ledger", () => {
  it("records and totals counts", () => {
    usage.record("prompts");
    usage.record("prompts", 2);
    usage.record("images");
    expect(usage.get().prompts).toBe(3);
    expect(usage.total()).toBe(4);
  });
});

describe("mobile stubs", () => {
  it("mobile-ready template ships native config files", () => {
    const f = TEMPLATES["mobile-ready"]!;
    expect(Object.keys(f)).toEqual(
      expect.arrayContaining([
        "index.html",
        "capacitor.config.ts",
        "app.json",
        "android/app/build.gradle",
        "ios/App/App/Info.plist",
        "mobile/README.md",
      ]),
    );
  });
  it("threads app name and package id through the stubs", () => {
    const f = mobileStubs("Neon Lab", "com.neon.lab");
    expect(f["capacitor.config.ts"]).toContain('appId: "com.neon.lab"');
    expect(JSON.parse(f["app.json"]!).expo.slug).toBe("neon-lab");
    expect(f["android/app/build.gradle"]).toContain('applicationId "com.neon.lab"');
  });
});
