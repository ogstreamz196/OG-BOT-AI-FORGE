import { useState } from "react";
import {
  Shield,
  Brain as BrainIcon,
  Lightbulb,
  Loader2,
  AlertTriangle,
  GitPullRequest,
  Github,
} from "lucide-react";
import { Panel, Btn } from "./ui";
import { cn } from "@/lib/utils";
import { PERMISSIONS, permissions, usePermissions, type PermId } from "@/lib/permissions";
import { brain, useBrain } from "@/lib/brain";
import { connectors } from "@/lib/connectors";
import { models } from "@/lib/models";
import { quickChat } from "@/lib/local-ai";
import { githubListRepos, openImprovementPR } from "@/lib/git-actions";

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      onClick={onClick}
      className={cn(
        "h-6 w-11 shrink-0 rounded-full p-0.5 transition",
        on ? "bg-primary" : "bg-muted",
      )}
    >
      <span
        className={cn(
          "block h-5 w-5 rounded-full bg-white transition",
          on ? "translate-x-5" : "translate-x-0",
        )}
      />
    </button>
  );
}

export function SelfImprove() {
  const granted = usePermissions();
  const b = useBrain();
  const [draft, setDraft] = useState(b.systemPrompt);
  const [proposal, setProposal] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [prMsg, setPrMsg] = useState<string | null>(null);
  const [repoMsg, setRepoMsg] = useState<string | null>(null);

  const listRepos = async () => {
    setRepoMsg("Reading repos…");
    try {
      const r = await githubListRepos();
      setRepoMsg(
        r.ok
          ? `${r.message}: ${r.repos
              .slice(0, 6)
              .map((x) => x.full_name)
              .join(", ")}${r.repos.length > 6 ? "…" : ""}`
          : r.message,
      );
    } catch {
      setRepoMsg("Could not read repos.");
    }
  };

  const openPR = async () => {
    if (!proposal) return;
    if (!(await permissions.request("apply-code"))) return;
    setPrMsg("Opening merge request…");
    try {
      const title = proposal.split("\n")[0]?.slice(0, 72) || "AI improvement";
      const r = await openImprovementPR({ data: { title, body: proposal } });
      setPrMsg(r.ok ? `✓ ${r.message}${r.url ? ` ${r.url}` : ""}` : r.message);
    } catch (e) {
      setPrMsg(e instanceof Error ? e.message : "Failed to open merge request.");
    }
  };

  const isOn = (id: PermId) => !!granted.granted[id];

  const propose = async () => {
    const ok = await permissions.request("propose-code");
    if (!ok) return;
    const ollama = connectors.isEnabled("ollama") ? connectors.configOf("ollama")["baseUrl"] : null;
    if (!ollama) {
      setProposal(
        "Connect your local AI (Tools → Connectors → Ollama) so the AI can draft improvements.",
      );
      return;
    }
    setBusy(true);
    setProposal(null);
    try {
      const model = models.activeTag() ?? "llama3.2:1b";
      const text = await quickChat(
        ollama,
        model,
        "You are improving your OWN front-end: an offline, React + TypeScript AI web-app builder with a chat, live preview, section library, theme panel and connectors. Propose ONE small, concrete UI/feature improvement. Reply with: a one-line title, 2-3 sentences why, and a short code sketch. Keep it under 180 words.",
      );
      setProposal(text || "No proposal returned.");
    } catch (e) {
      setProposal(`Could not reach the local model (${e instanceof Error ? e.message : "error"}).`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <Panel title="Permissions">
        <p className="mb-3 text-xs text-muted-foreground">
          <Shield className="mr-1 inline h-3 w-3 text-primary" />
          Every intelligent capability is off until you allow it, and you can revoke any of them
          here at any time.
        </p>
        <ul className="space-y-2">
          {PERMISSIONS.map((p) => (
            <li
              key={p.id}
              className="flex items-start justify-between gap-3 rounded-xl border border-border bg-card px-3 py-2"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  {p.danger && <AlertTriangle className="h-3.5 w-3.5 text-destructive" />}
                  {p.title}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{p.description}</p>
              </div>
              <Toggle
                on={isOn(p.id)}
                onClick={() =>
                  isOn(p.id) ? permissions.revoke(p.id) : void permissions.request(p.id)
                }
              />
            </li>
          ))}
        </ul>
      </Panel>

      <Panel
        title="Its Logic"
        right={
          <Btn
            variant="ghost"
            onClick={() => {
              brain.reset();
              setDraft(brain.get().systemPrompt);
            }}
          >
            Reset
          </Btn>
        }
      >
        <p className="mb-2 text-xs text-muted-foreground">
          <BrainIcon className="mr-1 inline h-3 w-3 text-primary" />
          The system prompt and chaining the AI uses to build. Tuning needs the “Tune its own logic”
          permission.
        </p>
        <label className="mb-2 flex items-center justify-between gap-3 rounded border border-border bg-card px-3 py-2 text-sm">
          <span className="text-foreground">Chain reasoning → coding on hard tasks</span>
          <Toggle
            on={b.chain}
            onClick={async () => {
              if (!isOn("self-tune") && !(await permissions.request("self-tune"))) return;
              brain.set({ chain: !b.chain });
            }}
          />
        </label>
        <label className="mb-2 flex items-center justify-between gap-3 rounded border border-border bg-card px-3 py-2 text-sm">
          <span className="min-w-0 text-foreground">
            Router model
            <span className="block text-[11px] text-muted-foreground">
              Small fast model that assigns each task to a specialist. Blank = auto-pick.
            </span>
          </span>
          <input
            value={b.routerModel}
            onChange={(e) => brain.set({ routerModel: e.target.value })}
            disabled={!isOn("self-tune")}
            placeholder="auto (e.g. llama3.2:3b)"
            className="w-40 shrink-0 rounded border border-input bg-background px-2 py-1 font-mono text-[11px] text-foreground outline-none focus:border-primary disabled:opacity-60"
          />
        </label>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={!isOn("self-tune")}
          rows={7}
          className="w-full resize-y rounded border border-input bg-background p-2 font-mono text-[11px] leading-relaxed text-foreground outline-none focus:border-primary disabled:opacity-60"
        />
        <div className="mt-2 flex gap-2">
          {isOn("self-tune") ? (
            <Btn onClick={() => brain.set({ systemPrompt: draft })}>Save logic</Btn>
          ) : (
            <Btn onClick={() => void permissions.request("self-tune")}>Allow tuning</Btn>
          )}
        </div>
      </Panel>

      <Panel
        title="Propose Front-End Improvements"
        right={
          <Btn onClick={() => void propose()} disabled={busy}>
            {busy ? (
              <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />
            ) : (
              <Lightbulb className="mr-1 inline h-3 w-3" />
            )}
            Propose
          </Btn>
        }
      >
        <p className="text-xs text-muted-foreground">
          The AI reads what it is and drafts an improvement. The only way it changes its own code is
          by <span className="text-foreground">opening a merge request on your GitHub</span> that
          you review and merge — never a direct write to the live site.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Btn variant="ghost" onClick={() => void listRepos()}>
            <Github className="mr-1 inline h-3 w-3" />
            List my repos
          </Btn>
          {repoMsg && (
            <span className="font-mono text-[11px] text-muted-foreground">{repoMsg}</span>
          )}
        </div>
        {proposal && (
          <>
            <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded border border-border bg-background p-3 text-xs text-foreground">
              {proposal}
            </pre>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Btn onClick={() => void openPR()}>
                <GitPullRequest className="mr-1 inline h-3 w-3" />
                Open merge request
              </Btn>
              {prMsg && <span className="font-mono text-[11px] text-primary">{prMsg}</span>}
            </div>
          </>
        )}
      </Panel>
    </div>
  );
}
