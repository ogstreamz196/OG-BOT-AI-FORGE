import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, Smartphone, Apple, Globe } from "lucide-react";
import { Panel, Btn, inputCls } from "./ui";
import { useWorkspace } from "@/lib/workspace";
import { usage } from "@/lib/usage";
import { PLATFORM_LABEL, normalizeAppId, type BuildPlatform } from "@/lib/github-build";
import { dispatchBuild, buildStatus, type BuildStatus } from "@/lib/build-actions";
import { cn } from "@/lib/utils";

type Entry = { platform: BuildPlatform; at: string; message: string; runsUrl?: string };

const PLATFORMS: { id: BuildPlatform; icon: typeof Smartphone }[] = [
  { id: "android", icon: Smartphone },
  { id: "ios", icon: Apple },
  { id: "web", icon: Globe },
];

const PHASE_STYLE: Record<BuildStatus["phase"], string> = {
  queued: "text-warning",
  running: "text-warning animate-pulse",
  success: "text-primary",
  failed: "text-destructive",
  none: "text-muted-foreground",
};

export function Forge() {
  const { project, files } = useWorkspace();
  const [appName, setAppName] = useState(project);
  const [appId, setAppId] = useState(normalizeAppId(project));
  const [platform, setPlatform] = useState<BuildPlatform>("android");
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<Entry[]>([]);
  const [status, setStatus] = useState<BuildStatus | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
  };
  useEffect(() => stopPolling, []);

  const poll = useCallback((p: BuildPlatform) => {
    stopPolling();
    let ticks = 0;
    const tick = async () => {
      ticks += 1;
      try {
        const s = await buildStatus({ data: { platform: p } });
        setStatus(s);
        if (s.phase === "success" || s.phase === "failed" || ticks > 120) stopPolling();
      } catch {
        stopPolling();
      }
    };
    void tick();
    pollRef.current = setInterval(() => void tick(), 5000);
  }, []);

  const build = async () => {
    if (busy) return;
    setBusy(true);
    setStatus(null);
    try {
      const res = await dispatchBuild({
        data: { platform, appName, appId: normalizeAppId(appId, appName), project, files },
      });
      const entry: Entry = { platform, at: new Date().toLocaleTimeString(), message: res.message };
      if (res.runsUrl) entry.runsUrl = res.runsUrl;
      setLog((l) => [entry, ...l].slice(0, 20));
      if (res.ok) {
        usage.record("builds");
        poll(platform);
      }
    } catch (e) {
      setLog((l) => [
        {
          platform,
          at: new Date().toLocaleTimeString(),
          message: e instanceof Error ? e.message : "Dispatch failed.",
        },
        ...l,
      ]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Panel title="Build & Publish Station">
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Packages the current Workbench project{" "}
            <span className="font-mono text-foreground">{project}</span> (
            {Object.keys(files).length} files). Builds run in GitHub Actions (CI); artifacts appear
            on the run page.
          </p>
          <label className="block text-xs text-muted-foreground">
            App name
            <input
              className={inputCls}
              value={appName}
              onChange={(e) => setAppName(e.target.value)}
            />
          </label>
          <label className="block text-xs text-muted-foreground">
            Package / bundle id
            <input className={inputCls} value={appId} onChange={(e) => setAppId(e.target.value)} />
          </label>
          <div className="flex flex-wrap gap-2">
            {PLATFORMS.map(({ id, icon: I }) => (
              <Btn
                key={id}
                variant={platform === id ? "blue" : "ghost"}
                onClick={() => setPlatform(id)}
              >
                <I className="mr-1 inline h-3 w-3" />
                {PLATFORM_LABEL[id]}
              </Btn>
            ))}
          </div>
          <Btn onClick={build} disabled={busy} className="w-full">
            {busy
              ? "Dispatching…"
              : platform === "web"
                ? "Publish web app"
                : `Build ${PLATFORM_LABEL[platform]}`}
          </Btn>
          {status && (
            <div className="rounded border border-border bg-card p-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Latest run</span>
                <span className={cn("font-mono uppercase", PHASE_STYLE[status.phase])}>
                  {status.phase}
                </span>
              </div>
              {status.htmlUrl && (
                <a
                  href={status.htmlUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-flex items-center gap-1 text-secondary hover:underline"
                >
                  View run on GitHub <ExternalLink className="h-3 w-3" />
                </a>
              )}
              {status.artifacts.map((a) => (
                <a
                  key={a.name}
                  href={a.htmlUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 block text-primary hover:underline"
                >
                  ⬇ {a.name}
                </a>
              ))}
            </div>
          )}
        </div>
      </Panel>
      <Panel title="Build Log">
        {log.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No builds dispatched yet. Pick a target and build.
          </p>
        ) : (
          <ul className="space-y-2">
            {log.map((e, i) => (
              <li
                key={i}
                className="rounded border border-border bg-card px-3 py-2 font-mono text-xs"
              >
                <div className="flex justify-between text-muted-foreground">
                  <span>{PLATFORM_LABEL[e.platform]}</span>
                  <span>{e.at}</span>
                </div>
                <div className="text-foreground">{e.message}</div>
                {e.runsUrl && (
                  <a
                    href={e.runsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-secondary hover:underline"
                  >
                    workflow <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
