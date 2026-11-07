import { useState } from "react";
import { Shield, Brain as BrainIcon, Lightbulb, Loader2, AlertTriangle } from "lucide-react";
import { Panel, Btn } from "./ui";
import { cn } from "@/lib/utils";
import { PERMISSIONS, permissions, usePermissions, type PermId } from "@/lib/permissions";
import { brain, useBrain } from "@/lib/brain";
import { connectors } from "@/lib/connectors";
import { models } from "@/lib/models";
import { quickChat } from "@/lib/local-ai";

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
      const model = models.activeDef()?.pull ?? "llama3.2:1b";
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
          The AI reads what it is and drafts an improvement for you to review. Proposals are shown
          only — applying one to the live app is a separate, explicit step (the “Apply approved code
          changes” permission, via a reviewed pull request), so nothing changes without you.
        </p>
        {proposal && (
          <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded border border-border bg-background p-3 text-xs text-foreground">
            {proposal}
          </pre>
        )}
      </Panel>
    </div>
  );
}
