/**
 * Pure helpers for the remote build pipeline. No network, no secrets — just the
 * mapping between a build target and the GitHub Actions workflow + the payloads
 * we send. Kept separate from build-actions.ts so it is unit-testable.
 */

export type BuildPlatform = "android" | "ios" | "web";

export const WORKFLOW_FILE: Record<BuildPlatform, string> = {
  android: "build-android.yml",
  ios: "build-ios.yml",
  web: "deploy.yml",
};

export const PLATFORM_LABEL: Record<BuildPlatform, string> = {
  android: "Android APK",
  ios: "iOS app (unsigned)",
  web: "Web app (Cloudflare)",
};

/** The dedicated branch that holds the project snapshot CI builds from. */
export const BUILD_BRANCH = "app-build";

export type BuildFiles = Record<string, string>;

/** Git tree entries for the project: every file under www/, plus meta.json. */
export function treeEntries(
  files: BuildFiles,
  meta: { appName: string; appId: string; project: string },
) {
  const entries = Object.entries(files).map(([path, content]) => ({
    path: `www/${path}`,
    mode: "100644" as const,
    type: "blob" as const,
    content,
  }));
  entries.push({
    path: "meta.json",
    mode: "100644" as const,
    type: "blob" as const,
    content: JSON.stringify(meta, null, 2),
  });
  return entries;
}

/** Normalize an appId to a valid reverse-DNS package id (com.ogbot.myapp). */
export function normalizeAppId(raw: string, fallbackName = "app"): string {
  const r = (raw || "").trim();
  const lower = r.toLowerCase();
  // Keep it only when it already is a deliberate reverse-DNS id (dotted, no spaces).
  if (/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(lower)) return lower;
  const slug = (r || fallbackName).toLowerCase().replace(/[^a-z0-9]+/g, "") || "app";
  return `com.ogbot.${slug}`;
}

export type RunStatus = {
  status: string | null; // queued | in_progress | completed
  conclusion: string | null; // success | failure | cancelled | null
  htmlUrl: string | null;
  runId: number | null;
};

/** Pull the fields we care about out of a GitHub "workflow run" object. */
export function pickRun(run: Record<string, unknown> | undefined): RunStatus {
  if (!run) return { status: null, conclusion: null, htmlUrl: null, runId: null };
  return {
    status: (run["status"] as string) ?? null,
    conclusion: (run["conclusion"] as string) ?? null,
    htmlUrl: (run["html_url"] as string) ?? null,
    runId: (run["id"] as number) ?? null,
  };
}

/** Human phase for the UI from a run's status/conclusion. */
export function phaseOf(s: RunStatus): "queued" | "running" | "success" | "failed" | "none" {
  if (!s.status) return "none";
  if (s.status === "completed") return s.conclusion === "success" ? "success" : "failed";
  if (s.status === "in_progress") return "running";
  return "queued";
}
