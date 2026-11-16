import { useCallback, useEffect, useRef, useState } from "react";
import {
  ExternalLink,
  Smartphone,
  Apple,
  Globe,
  CheckCircle2,
  CircleAlert,
  Loader2,
  Trash2,
} from "lucide-react";
import { usePersistentState } from "@/hooks/use-persistent-state";
import { Panel, Btn, inputCls } from "./ui";
import { useWorkspace } from "@/lib/workspace";
import { usage } from "@/lib/usage";
import { PLATFORM_LABEL, normalizeAppId, type BuildPlatform } from "@/lib/github-build";
import {
  dispatchBuild,
  buildSetup,
  buildStatus,
  type BuildSetup,
  type BuildStatus,
} from "@/lib/build-actions";
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
  const [platform, setPlatform] = useState<BuildPlatform>(() => {
    try {
      const t = sessionStorage.getItem("og-publish-target");
      sessionStorage.removeItem("og-publish-target");
      return t === "web" || t === "ios" || t === "android" ? t : "android";
    } catch {
      return "android";
    }
  });
  const [busy, setBusy] = useState(false);
  const [log, setLog] = usePersistentState<Entry[]>("og-build-log", []);
  const [version, setVersion] = usePersistentState(`og-app-version:${project}`, "1.0.0");
  const [splash, setSplash] = usePersistentState(`og-app-splash:${project}`, "#0b0d1f");
  const [icon, setIcon] = usePersistentState<string>(`og-app-icon:${project}`, "");
  const [iconNote, setIconNote] = useState<string | null>(null);
  const [setup, setSetup] = useState<BuildSetup | null>(null);
  useEffect(() => {
    let live = true;
    buildSetup()
      .then((r) => live && setSetup(r))
      .catch(
        () =>
          live &&
          setSetup({
            configured: false,
            repo: null,
            workflows: { android: false, ios: false, web: false },
            message: "Couldn't check (offline?).",
          }),
      );
    return () => {
      live = false;
    };
  }, []);

  const pickIcon = (f: File | undefined) => {
    if (!f) return;
    if (f.type !== "image/png") return setIconNote("Use a PNG (square, 1024×1024 is best).");
    if (f.size > 2_000_000) return setIconNote("That PNG is over 2 MB; use a smaller one.");
    const r = new FileReader();
    r.onload = () => {
      setIcon(String(r.result));
      setIconNote(null);
    };
    r.readAsDataURL(f);
  };
  const ready = setup ? setup.configured && setup.workflows[platform] : null;
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
        data: {
          platform,
          appName,
          appId: normalizeAppId(appId, appName),
          project,
          files,
          version,
          splash,
          ...(icon ? { icon } : {}),
        },
      });
      const entry: Entry = { platform, at: new Date().toLocaleString(), message: res.message };
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
          {platform !== "web" && (
            <div className="grid grid-cols-[auto_1fr_1fr] items-end gap-3">
              <label className="flex cursor-pointer flex-col items-center gap-1 text-[11px] text-muted-foreground">
                {icon ? (
                  <img
                    src={icon}
                    alt="App icon"
                    className="h-14 w-14 rounded-2xl border border-border object-cover"
                  />
                ) : (
                  <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-dashed border-border text-[10px]">
                    PNG
                  </span>
                )}
                {icon ? "Change icon" : "App icon"}
                <input
                  type="file"
                  accept="image/png"
                  hidden
                  aria-label="App icon"
                  onChange={(e) => pickIcon(e.target.files?.[0])}
                />
              </label>
              <label className="block text-xs text-muted-foreground">
                Version
                <input
                  className={inputCls}
                  value={version}
                  onChange={(e) => setVersion(e.target.value.replace(/[^\d.]/g, ""))}
                  placeholder="1.0.0"
                />
              </label>
              <label className="block text-xs text-muted-foreground">
                Splash colour
                <span className="mt-1 flex items-center gap-2">
                  <input
                    type="color"
                    aria-label="Splash colour"
                    value={splash}
                    onChange={(e) => setSplash(e.target.value)}
                    className="h-9 w-10 cursor-pointer rounded border border-border bg-transparent"
                  />
                  <span className="font-mono text-[11px]">{splash}</span>
                </span>
              </label>
              {iconNote && <p className="col-span-3 text-[11px] text-destructive">{iconNote}</p>}
              {platform === "ios" && (
                <p className="col-span-3 text-[11px] text-muted-foreground">
                  iPhone builds use the name and id; icon and splash are set when you sign it in
                  Xcode.
                </p>
              )}
            </div>
          )}
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
          <div className="rounded-lg border border-border bg-card p-2 text-xs">
            <p className="mb-1 font-semibold">Before you build</p>
            {setup === null ? (
              <p className="flex items-center gap-1 text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Checking…
              </p>
            ) : (
              <ul className="space-y-1">
                <li className="flex items-start gap-1.5">
                  {setup.configured ? (
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
                  ) : (
                    <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                  )}
                  <span>
                    {setup.configured ? `GitHub connected (${setup.repo})` : setup.message}
                  </span>
                </li>
                <li className="flex items-start gap-1.5">
                  {setup.workflows[platform] ? (
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
                  ) : (
                    <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                  )}
                  <span>
                    {setup.workflows[platform]
                      ? `${PLATFORM_LABEL[platform]} build workflow is in the repo`
                      : `The ${PLATFORM_LABEL[platform]} workflow isn't in the repo yet (.github/workflows/${platform === "web" ? "deploy" : `build-${platform}`}.yml)`}
                  </span>
                </li>
                <li className="flex items-start gap-1.5 text-muted-foreground">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
                  {Object.keys(files).length} files in {project}
                  {platform === "android" ? " · takes about 5 minutes" : ""}
                </li>
              </ul>
            )}
          </div>
          <Btn onClick={build} disabled={busy || ready === false} className="w-full">
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
      <Panel
        title="Build Log"
        right={
          log.length > 0 && (
            <button
              onClick={() => setLog([])}
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-destructive"
              aria-label="Clear build log"
            >
              <Trash2 className="h-3 w-3" /> Clear
            </button>
          )
        }
      >
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
