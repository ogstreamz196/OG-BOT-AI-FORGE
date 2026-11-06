import { useState } from "react";
import { Panel, Btn, Bar, inputCls } from "./ui";
import { usage } from "@/lib/usage";

const STAGES = ["Bundling web assets", "Generating Android project", "Compiling resources", "Gradle assemble", "Signing with keystore", "Aligning APK"];

export function Forge() {
  const [name, setName] = useState("OG-BOT App");
  const [pkg, setPkg] = useState("com.ogbot.app");
  const [target, setTarget] = useState("APK");
  const [p, setP] = useState(-1);
  const [builds, setBuilds] = useState<string[]>([]);

  const build = () => {
    setP(0);
    let i = 0;
    const id = setInterval(() => {
      i += 4;
      setP(i);
      if (i >= 100) {
        clearInterval(id);
        setBuilds((b) => [`${pkg}-v1.0.${b.length}.${target.toLowerCase()} · ${(18 + Math.random() * 6).toFixed(1)} MB`, ...b]);
        usage.record("builds");
        setTimeout(() => setP(-1), 800);
      }
    }, 120);
  };
  const stage = Math.min(STAGES.length - 1, Math.floor((p / 100) * STAGES.length));

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Panel title="APK Forge · Packaging Station">
        <div className="space-y-3">
          <label className="block text-xs text-muted-foreground">App name<input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label className="block text-xs text-muted-foreground">Package id<input className={inputCls} value={pkg} onChange={(e) => setPkg(e.target.value)} /></label>
          <div className="flex gap-2">
            {["APK", "AAB", "IPA"].map((t) => (
              <Btn key={t} variant={target === t ? "blue" : "ghost"} onClick={() => setTarget(t)}>{t}</Btn>
            ))}
          </div>
          <Btn onClick={build} disabled={p >= 0} className="w-full">{p >= 0 ? "Forging…" : `Forge ${target}`}</Btn>
          {p >= 0 && (
            <div className="space-y-1">
              <Bar value={p} />
              <div className="font-mono text-xs text-primary">[{p}%] {STAGES[stage]}</div>
            </div>
          )}
        </div>
      </Panel>
      <Panel title="Build Artifacts">
        {builds.length === 0 ? (
          <p className="text-sm text-muted-foreground">No builds yet. Forge one to see it here.</p>
        ) : (
          <ul className="space-y-2">
            {builds.map((b, i) => (
              <li key={i} className="flex items-center justify-between rounded border border-border bg-card px-3 py-2 font-mono text-xs">
                <span className="text-foreground">{b}</span><span className="text-primary">SIGNED ✓</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
