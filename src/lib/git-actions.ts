import { createServerFn } from "@tanstack/react-start";

/**
 * GitHub actions, server-side only. The token lives on the Worker
 * (process.env.GITHUB_TOKEN) and is never shipped to the browser — same pattern
 * as the Forge builds. This is how "git is connected": the app reads your repos
 * and opens merge requests (pull requests) through the Worker.
 *
 * The ONLY way the AI changes its own code is by opening a PR you review — it
 * never writes to the deploy branch directly.
 */

const GH = "https://api.github.com";

type Env = { token: string; repo: string };
function readEnv(): Env | null {
  const token = process.env["GITHUB_TOKEN"];
  const repo = process.env["GITHUB_REPO"];
  if (!token) return null;
  return { token, repo: repo ?? "" };
}

async function gh<T = unknown>(
  token: string,
  path: string,
  opts?: { method?: string; json?: unknown },
): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
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
  const text = await res.text();
  const data = text ? (JSON.parse(text) as T) : (undefined as T);
  if (!res.ok)
    throw new Error(
      `GitHub ${res.status}: ${(data as { message?: string })?.message ?? res.statusText}`,
    );
  return data;
}

export type RepoRow = { full_name: string; private: boolean; html_url: string };
export type ReposResult = { ok: boolean; repos: RepoRow[]; message: string };

/** List every repo the connected token can read (owner / collaborator / org). */
export const githubListRepos = createServerFn({ method: "GET" }).handler(
  async (): Promise<ReposResult> => {
    const env = readEnv();
    if (!env)
      return { ok: false, repos: [], message: "Connect git: set GITHUB_TOKEN on the Worker." };
    try {
      const rows = await gh<RepoRow[]>(
        env.token,
        `/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member`,
      );
      return {
        ok: true,
        repos: rows.map((r) => ({
          full_name: r.full_name,
          private: r.private,
          html_url: r.html_url,
        })),
        message: `${rows.length} repos`,
      };
    } catch (e) {
      return {
        ok: false,
        repos: [],
        message: e instanceof Error ? e.message : "Failed to list repos.",
      };
    }
  },
);

export type PRResult = { ok: boolean; url?: string; message: string };

/** Open a merge request (PR) carrying an improvement note for the dev to review. */
export const openImprovementPR = createServerFn({ method: "POST" })
  .validator((data: { title: string; body: string }) => data)
  .handler(async ({ data }): Promise<PRResult> => {
    const env = readEnv();
    if (!env || !env.repo)
      return { ok: false, message: "Connect git: set GITHUB_TOKEN and GITHUB_REPO on the Worker." };
    try {
      const info = await gh<{ default_branch: string }>(env.token, `/repos/${env.repo}`);
      const base = info.default_branch;
      const ref = await gh<{ object: { sha: string } }>(
        env.token,
        `/repos/${env.repo}/git/ref/heads/${base}`,
      );
      const branch = `improve/${Date.now()}`;
      await gh(env.token, `/repos/${env.repo}/git/refs`, {
        method: "POST",
        json: { ref: `refs/heads/${branch}`, sha: ref.object.sha },
      });
      const path = `improvements/${branch.replace("improve/", "")}.md`;
      const content = `# ${data.title}\n\n${data.body}\n\n_Proposed by OG-BOT self-improve. Review and implement, then merge._\n`;
      await gh(env.token, `/repos/${env.repo}/contents/${path}`, {
        method: "PUT",
        json: {
          message: `improve: ${data.title}`,
          content: btoa(unescape(encodeURIComponent(content))),
          branch,
        },
      });
      const pr = await gh<{ html_url: string }>(env.token, `/repos/${env.repo}/pulls`, {
        method: "POST",
        json: { title: `Improve: ${data.title}`, head: branch, base, body: data.body },
      });
      const result: PRResult = { ok: true, message: "Merge request opened." };
      if (pr.html_url) result.url = pr.html_url;
      return result;
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : "Failed to open PR." };
    }
  });
