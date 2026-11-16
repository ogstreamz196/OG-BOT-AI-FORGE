import { createServerFn } from "@tanstack/react-start";
import {
  BUILD_BRANCH,
  WORKFLOW_FILE,
  normalizeAppId,
  phaseOf,
  pickRun,
  treeEntries,
  versionCodeOf,
  type BuildFiles,
  type BuildPlatform,
} from "./github-build";

/**
 * Server functions (run only in the Cloudflare Worker, never shipped to the
 * browser) that drive real builds through GitHub Actions:
 *
 *  - dispatchBuild: snapshot the Workbench project to the `app-build` branch and
 *    trigger the matching workflow (android / ios), or dispatch the web deploy.
 *  - buildStatus: report the latest run for a platform (phase + artifact links).
 *
 * The GitHub token lives server-side only (process.env.GITHUB_TOKEN); it is
 * read inside the handlers so it can never leak into the client bundle.
 */

const GH = "https://api.github.com";

type Env = { token: string; repo: string };
function readEnv(): Env | null {
  const token = process.env["GITHUB_TOKEN"];
  const repo = process.env["GITHUB_REPO"];
  if (!token || !repo) return null;
  return { token, repo };
}

async function gh<T = unknown>(
  env: Env,
  path: string,
  opts?: { method?: string; json?: unknown },
): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${env.token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "og-bot-studio",
  };
  const init: RequestInit = { method: opts?.method ?? "GET" };
  if (opts?.json !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(opts.json);
  }
  init.headers = headers;
  const res = await fetch(`${GH}${path}`, init);
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const data = text ? (JSON.parse(text) as T) : (undefined as T);
  if (!res.ok) {
    const msg = (data as { message?: string })?.message ?? res.statusText;
    throw new Error(`GitHub ${res.status}: ${msg}`);
  }
  return data;
}

export type BuildRequest = {
  platform: BuildPlatform;
  appName: string;
  appId: string;
  project: string;
  files: BuildFiles;
  /** App version shown to users, e.g. 1.0.3. */
  version?: string;
  /** Splash / icon background colour (#rrggbb). */
  splash?: string;
  /** App icon as a PNG data URL (square, 1024 px is best). */
  icon?: string;
};

export type BuildResult = { ok: boolean; message: string; runsUrl?: string };

async function commitProject(env: Env, req: BuildRequest): Promise<void> {
  const repoInfo = await gh<{ default_branch: string }>(env, `/repos/${env.repo}`);
  const base = repoInfo.default_branch;

  // Base commit sha: the app-build branch if it exists, else the default branch.
  let baseSha: string;
  try {
    const ref = await gh<{ object: { sha: string } }>(
      env,
      `/repos/${env.repo}/git/ref/heads/${BUILD_BRANCH}`,
    );
    baseSha = ref.object.sha;
  } catch {
    const ref = await gh<{ object: { sha: string } }>(
      env,
      `/repos/${env.repo}/git/ref/heads/${base}`,
    );
    baseSha = ref.object.sha;
    await gh(env, `/repos/${env.repo}/git/refs`, {
      method: "POST",
      json: { ref: `refs/heads/${BUILD_BRANCH}`, sha: baseSha },
    }).catch(() => {});
  }

  // Fresh tree (only the project snapshot), new commit, move the branch to it.
  const tree = await gh<{ sha: string }>(env, `/repos/${env.repo}/git/trees`, {
    method: "POST",
    json: {
      tree: treeEntries(req.files, {
        appName: req.appName,
        appId: req.appId,
        project: req.project,
        version: req.version || "1.0.0",
        versionCode: versionCodeOf(req.version || "1.0.0"),
        ...(req.splash ? { splash: req.splash } : {}),
        ...(req.icon && /^data:image\/png;base64,/.test(req.icon) && req.icon.length < 2_800_000 ? { icon: req.icon } : {}),
      }),
    },
  });
  const commit = await gh<{ sha: string }>(env, `/repos/${env.repo}/git/commits`, {
    method: "POST",
    json: {
      message: `build: ${req.project} (${req.platform})`,
      tree: tree.sha,
      parents: [baseSha],
    },
  });
  await gh(env, `/repos/${env.repo}/git/refs/heads/${BUILD_BRANCH}`, {
    method: "PATCH",
    json: { sha: commit.sha, force: true },
  });
}

export const dispatchBuild = createServerFn({ method: "POST" })
  .validator((data: BuildRequest) => data)
  .handler(async ({ data }): Promise<BuildResult> => {
    const env = readEnv();
    if (!env) {
      return {
        ok: false,
        message: "Builds aren't set up yet: add the GITHUB_TOKEN and GITHUB_REPO secrets in Lovable (Project → Secrets).",
      };
    }
    const appId = normalizeAppId(data.appId, data.appName);
    const workflow = WORKFLOW_FILE[data.platform];
    try {
      if (data.platform === "web") {
        const repoInfo = await gh<{ default_branch: string }>(env, `/repos/${env.repo}`);
        await gh(env, `/repos/${env.repo}/actions/workflows/${workflow}/dispatches`, {
          method: "POST",
          json: { ref: repoInfo.default_branch },
        });
      } else {
        await commitProject(env, { ...data, appId });
        await gh(env, `/repos/${env.repo}/actions/workflows/${workflow}/dispatches`, {
          method: "POST",
          json: { ref: BUILD_BRANCH, inputs: { appName: data.appName, appId } },
        });
      }
      return {
        ok: true,
        message: `Build dispatched for ${data.platform}.`,
        runsUrl: `https://github.com/${env.repo}/actions/workflows/${workflow}`,
      };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : "Dispatch failed." };
    }
  });

export type BuildSetup = {
  configured: boolean;
  repo: string | null;
  workflows: Record<BuildPlatform, boolean>;
  message: string;
};

/** What publishing needs, checked up front: secrets present, and each workflow file in the repo. */
export const buildSetup = createServerFn({ method: "GET" }).handler(async (): Promise<BuildSetup> => {
  const none = { android: false, ios: false, web: false };
  const env = readEnv();
  if (!env) return { configured: false, repo: null, workflows: none, message: "Add the GITHUB_TOKEN and GITHUB_REPO secrets in Lovable (Project → Secrets)." };
  try {
    const list = await gh<{ workflows: { path: string; state: string }[] }>(env, `/repos/${env.repo}/actions/workflows`);
    const has = (file: string) => list.workflows.some((w) => w.path.endsWith(`/${file}`) && w.state === "active");
    return {
      configured: true,
      repo: env.repo,
      workflows: { android: has(WORKFLOW_FILE.android), ios: has(WORKFLOW_FILE.ios), web: has(WORKFLOW_FILE.web) },
      message: "ready",
    };
  } catch (e) {
    return { configured: true, repo: env.repo, workflows: none, message: e instanceof Error ? e.message : "Couldn't read the repo." };
  }
});

export type BuildStatus = {
  ok: boolean;
  phase: "queued" | "running" | "success" | "failed" | "none";
  htmlUrl: string | null;
  artifacts: { name: string; htmlUrl: string }[];
  message: string;
};

export const buildStatus = createServerFn({ method: "GET" })
  .validator((data: { platform: BuildPlatform }) => data)
  .handler(async ({ data }): Promise<BuildStatus> => {
    const env = readEnv();
    if (!env)
      return {
        ok: false,
        phase: "none",
        htmlUrl: null,
        artifacts: [],
        message: "Build backend not configured.",
      };
    const workflow = WORKFLOW_FILE[data.platform];
    const branch = data.platform === "web" ? "" : `&branch=${BUILD_BRANCH}`;
    try {
      const runs = await gh<{ workflow_runs: Record<string, unknown>[] }>(
        env,
        `/repos/${env.repo}/actions/workflows/${workflow}/runs?per_page=1${branch}`,
      );
      const run = pickRun(runs.workflow_runs?.[0]);
      const phase = phaseOf(run);
      let artifacts: { name: string; htmlUrl: string }[] = [];
      if (phase === "success" && run.runId) {
        const arts = await gh<{ artifacts: { name: string }[] }>(
          env,
          `/repos/${env.repo}/actions/runs/${run.runId}/artifacts`,
        ).catch(() => ({ artifacts: [] }));
        artifacts = (arts.artifacts ?? []).map((a) => ({
          name: a.name,
          htmlUrl: `${run.htmlUrl}#artifacts`,
        }));
      }
      return { ok: true, phase, htmlUrl: run.htmlUrl, artifacts, message: phase };
    } catch (e) {
      return {
        ok: false,
        phase: "none",
        htmlUrl: null,
        artifacts: [],
        message: e instanceof Error ? e.message : "Status failed.",
      };
    }
  });
