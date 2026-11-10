import { describe, expect, it } from "vitest";
import { normalizeAppId, phaseOf, pickRun, treeEntries, WORKFLOW_FILE } from "@/lib/github-build";

describe("normalizeAppId", () => {
  it("keeps a valid reverse-DNS id", () => {
    expect(normalizeAppId("com.ogbot.app")).toBe("com.ogbot.app");
  });
  it("derives a package id from a project name when invalid", () => {
    expect(normalizeAppId("Neon Lab!")).toBe("com.ogbot.neonlab");
    expect(normalizeAppId("", "Cool App")).toBe("com.ogbot.coolapp");
  });
});

describe("treeEntries", () => {
  it("prefixes project files with www/ and appends meta.json", () => {
    const entries = treeEntries(
      { "index.html": "<h1>hi</h1>", "app.js": "x" },
      { appName: "App", appId: "com.ogbot.app", project: "demo" },
    );
    const paths = entries.map((e) => e.path).sort();
    expect(paths).toEqual(["meta.json", "www/app.js", "www/index.html"]);
    const meta = entries.find((e) => e.path === "meta.json")!;
    expect(JSON.parse(meta.content).project).toBe("demo");
    expect(entries.every((e) => e.mode === "100644" && e.type === "blob")).toBe(true);
  });
});

describe("run status", () => {
  it("maps workflow file per platform", () => {
    expect(WORKFLOW_FILE.android).toBe("build-android.yml");
    expect(WORKFLOW_FILE.ios).toBe("build-ios.yml");
    expect(WORKFLOW_FILE.web).toBe("deploy.yml");
  });
  it("derives phase from status/conclusion", () => {
    expect(phaseOf(pickRun(undefined))).toBe("none");
    expect(phaseOf(pickRun({ status: "queued" }))).toBe("queued");
    expect(phaseOf(pickRun({ status: "in_progress" }))).toBe("running");
    expect(phaseOf(pickRun({ status: "completed", conclusion: "success" }))).toBe("success");
    expect(phaseOf(pickRun({ status: "completed", conclusion: "failure" }))).toBe("failed");
  });
});
