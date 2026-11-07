/**
 * Model orchestrator: makes all connected local models work together. It
 * classifies a task, picks the best installed model for it, and (for harder
 * tasks) plans a reason→build chain so a reasoning model drafts an approach that
 * a coding model then executes. Pure and deterministic, so it is unit-testable.
 */

export type TaskKind = "code" | "reason" | "vision" | "flagship" | "chat";

/** Preferred model name prefixes per task, best first. Matched against installed models. */
const PREFS: Record<TaskKind, string[]> = {
  code: [
    "qwen2.5-coder:32b",
    "qwen2.5-coder:14b",
    "qwen2.5-coder",
    "qwen2.5",
    "llama3.1",
    "llama3.2",
  ],
  reason: [
    "deepseek-r1:32b",
    "deepseek-r1:8b",
    "deepseek-r1",
    "qwen2.5:14b",
    "qwen2.5",
    "llama3.3",
  ],
  vision: ["gemma", "llama3.2-vision", "llava"],
  flagship: ["llama3.3:70b", "llama3.3", "qwen2.5:14b", "deepseek-r1:32b", "qwen2.5-coder:32b"],
  chat: ["llama3.2:3b", "llama3.2:1b", "llama3.1:8b", "qwen2.5", "llama3.2"],
};

const CODE_RE =
  /\b(code|coding|function|refactor|bug|debug|script|program|api|regex|component|css|html|javascript|typescript|python|react|build|add a|insert|section|button|form|page|website|landing|hero|navbar|footer)\b/i;
const REASON_RE =
  /\b(why|prove|reason|think|step[- ]by[- ]step|analy|calculate|math|logic|plan|strategy|compare|evaluate|explain how|trade[- ]?off)\b/i;
const VISION_RE =
  /\b(image|photo|screenshot|picture|diagram|vision|describe this|what('| i)s in)\b/i;
const FLAGSHIP_RE =
  /\b(flagship|best model|most capable|hardest|very complex|expert[- ]level|deep dive|comprehensive)\b/i;

export function classifyTask(prompt: string): TaskKind {
  const p = prompt.toLowerCase();
  if (FLAGSHIP_RE.test(p)) return "flagship";
  if (VISION_RE.test(p)) return "vision";
  if (CODE_RE.test(p)) return "code";
  if (REASON_RE.test(p)) return "reason";
  return "chat";
}

/** Choose the best installed model for a task kind, with graceful fallback. */
export function pickModel(kind: TaskKind, installed: string[]): string | null {
  if (installed.length === 0) return null;
  for (const pref of PREFS[kind]) {
    const hit = installed.find((m) => m === pref) ?? installed.find((m) => m.startsWith(pref));
    if (hit) return hit;
  }
  // Fall back to anything that isn't an embeddings model.
  return installed.find((m) => !/embed/i.test(m)) ?? installed[0] ?? null;
}

/** Harder tasks benefit from a reasoning pass first. */
export function needsReasoning(prompt: string): boolean {
  const kind = classifyTask(prompt);
  const longEnough = prompt.length > 140;
  const multiStep = /\band\b|\bthen\b|,|;|\n/.test(prompt) && prompt.length > 80;
  return (
    kind === "flagship" || ((kind === "code" || kind === "reason") && (longEnough || multiStep))
  );
}

export type PlanStep = { role: "reason" | "build"; model: string };

/**
 * Build the model chain for a task. Returns the reasoning step (if any) plus the
 * primary build/answer step. The caller feeds the reasoning output into the build
 * step so the models cooperate.
 */
export function planChain(
  prompt: string,
  installed: string[],
  opts?: { allowChain?: boolean },
): { kind: TaskKind; steps: PlanStep[] } {
  const kind = classifyTask(prompt);
  const primary = pickModel(kind, installed);
  const steps: PlanStep[] = [];
  if (!primary) return { kind, steps };
  if (opts?.allowChain && needsReasoning(prompt)) {
    const reasoner = pickModel("reason", installed);
    if (reasoner && reasoner !== primary) steps.push({ role: "reason", model: reasoner });
  }
  steps.push({ role: "build", model: primary });
  return { kind, steps };
}
