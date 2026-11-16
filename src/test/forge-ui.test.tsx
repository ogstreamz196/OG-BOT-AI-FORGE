import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { treeEntries, versionCodeOf } from "@/lib/github-build";

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("app details", () => {
  it("turns a version into a growing Android version code", () => {
    expect(versionCodeOf("1.0.0")).toBe(10000);
    expect(versionCodeOf("1.2.3")).toBe(10203);
    expect(versionCodeOf("2.0")).toBeGreaterThan(versionCodeOf("1.99.99"));
    expect(versionCodeOf("")).toBe(10000);
  });
  it("ships version, splash and icon in meta.json for the build", () => {
    const meta = JSON.parse(
      treeEntries({ "index.html": "x" }, { appName: "A", appId: "com.a", project: "a", version: "1.2.3", versionCode: 10203, splash: "#000000", icon: "data:image/png;base64,AA" }).find(
        (e) => e.path === "meta.json",
      )!.content,
    );
    expect(meta).toMatchObject({ version: "1.2.3", versionCode: 10203, splash: "#000000" });
  });
});

describe("Build & Publish screen", () => {
  it("checks what's needed before building and blocks when not ready", async () => {
    vi.doMock("@/lib/build-actions", () => ({
      buildSetup: async () => ({ configured: false, repo: null, workflows: { android: false, ios: false, web: false }, message: "Add the GITHUB_TOKEN and GITHUB_REPO secrets in Lovable (Project → Secrets)." }),
      dispatchBuild: vi.fn(),
      buildStatus: vi.fn(),
    }));
    const { Forge } = await import("@/components/studio/Forge");
    render(<Forge />);
    await act(async () => {});
    expect(screen.getByText(/GITHUB_TOKEN and GITHUB_REPO secrets in Lovable/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Build Android/ })).toBeDisabled();
    expect(screen.getByLabelText("Version")).toHaveValue("1.0.0");
    expect(screen.getByLabelText("Splash colour")).toBeInTheDocument();
  });
});
