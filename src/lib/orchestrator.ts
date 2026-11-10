/**
 * Model orchestrator: makes all connected local models work together like a team.
 *
 * A small, fast "router" model is purely in charge of designating which
 * specialist should handle each task — it reads the prompt and returns a task
 * category. The orchestrator then maps that category to the best installed
 * specialist (with graceful fallbacks), and for harder tasks plans a
 * reason→build chain so a reasoning model drafts an approach that a coding
 * model executes.
 *
 * Classification + model selection are pure and deterministic (so they are
 * unit-testable and always work offline). The router is an optional intelligence
 * layer on top: if it is unreachable or replies with junk, we fall back to the
 * deterministic classifier, so routing never blocks a build.
 */

export type TaskKind = "code" | "reason" | "vision" | "flagship" | "chat";

/**
 * Preferred model name prefixes per task, best first, matched against installed
 * models. Tuned for the full local lineup (qwen2.5-coder, codestral, devstral,
 * deepseek-r1, phi4, llama3.x, dolphin, mistral, vision models) but degrades to
 * whatever is actually installed.
 */
const PREFS: Record<TaskKind, string[]> = {
  // 16 GB VRAM (RTX 5080 over USB4): everything stays at ≤14B so all layers fit on the GPU.
  code: ["qwen2.5-coder:14b", "qwen2.5-coder:7b", "qwen2.5-coder", "qwen2.5:14b", "qwen2.5:7b", "llama3.2:3b"],
  reason: ["deepseek-r1:14b", "phi4:14b", "deepseek-r1:8b", "deepseek-r1", "phi4", "qwen2.5:14b", "qwen2.5"],
  vision: ["llama3.2-vision:11b", "llama3.2-vision", "minicpm-v", "llava"],
  flagship: ["qwen2.5:14b", "deepseek-r1:14b", "phi4:14b", "qwen2.5-coder:14b", "mistral-nemo:12b"],
  chat: ["llama3.2:3b", "qwen2.5:7b", "dolphin3:8b", "hermes3:8b", "mistral-nemo:12b", "qwen2.5:14b", "llama3.2:1b", "llama3.2"],
};

/** Small, fast models fit to act as the routing dispatcher, best first. */
const ROUTER_PREFS = [
  "llama3.2:3b",
  "llama3.2:1b",
  "dolphin3:8b",
  "hermes3:8b",
  "phi4:14b",
  "qwen2.5:7b",
  "llama3.1:8b",
];

const CODE_RE =
  /\b(code|coding|function|refactor|bug|debug|script|program|api|regex|component|css|html|javascript|typescript|python|react|build|add a|insert|section|button|form|page|website|landing|hero|navbar|footer)\b/i;
const REASON_RE =
  /\b(why|prove|reason|think|step[- ]by[- ]step|analy|calculate|math|logic|plan|strategy|compare|evaluate|explain how|trade[- ]?off)\b/i;
const VISION_RE =
  /\b(image|photo|screenshot|picture|diagram|vision|describe this|what('| i)s in)\b/i;
const FLAGSHIP_RE =
  /\b(flagship|best model|most capable|hardest|very complex|expert[- ]level|deep dive|comprehensive)\b/i;

/** Deterministic, offline classifier. Always available; used as the router's fallback. */
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

/** Choose the dispatcher/router model: a small fast model, never an embeddings model. */
export function pickRouter(installed: string[]): string | null {
  if (installed.length === 0) return null;
  for (const pref of ROUTER_PREFS) {
    const hit = installed.find((m) => m === pref) ?? installed.find((m) => m.startsWith(pref));
    if (hit) return hit;
  }
  return installed.find((m) => !/embed/i.test(m)) ?? installed[0] ?? null;
}

/** The prompt handed to the router model. It must reply with ONLY a JSON object. */
export function routerPrompt(prompt: string): string {
  return `You are the ROUTER for a team of local AI models. Your only job is to read a task and decide which specialist should handle it. Reply with ONLY a JSON object, no prose, no markdown:
{"kind":"code|reason|vision|flagship|chat","reason":"<max 8 words>"}

Categories:
- code: write or edit code, web pages, UI, components, scripts.
- reason: analysis, math, logic, planning, step-by-step thinking.
- vision: anything about an image, screenshot, photo or picture.
- flagship: very hard, complex or expert-level work needing the most capable model.
- chat: quick questions, small talk, simple short answers.

Task: ${prompt}`;
}

/**
 * Prompt for by-name routing: the router is shown exactly which models are
 * installed and must choose one of them by name (plus a category for chaining).
 */
export function routerModelPrompt(prompt: string, installed: string[]): string {
  return `You are the ROUTER for a team of local AI models. Pick the single best model for the task from the INSTALLED list — you must copy a name exactly as written, never invent one. Reply with ONLY a JSON object, no prose, no markdown:
{"model":"<exact name from the list>","kind":"code|reason|vision|flagship|chat","reason":"<max 8 words>"}

Guidance: coder models for code/UI; deepseek-r1/phi4 for reasoning & math; vision/llava/minicpm for images; the largest model for very hard tasks; a small fast model for quick chat.

INSTALLED models:
${installed.map((m) => `- ${m}`).join("\n")}

Task: ${prompt}`;
}

const KINDS: readonly TaskKind[] = ["code", "reason", "vision", "flagship", "chat"];

/** Match a model name the router returned against the installed list (exact, else prefix). */
function resolveInstalled(name: string, installed: string[]): string | null {
  const n = name.trim();
  if (!n) return null;
  return (
    installed.find((m) => m === n) ??
    installed.find((m) => m.startsWith(n)) ??
    installed.find((m) => n.startsWith(m)) ??
    null
  );
}

/**
 * Parse a by-name router reply into a concrete installed model (+ optional kind).
 * Returns null if the named model is not actually installed. Pure + tested.
 */
export function parseModelRoute(
  text: string,
  installed: string[],
): { model: string; kind: TaskKind | null } | null {
  if (!text) return null;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const obj = JSON.parse(text.slice(start, end + 1)) as { model?: unknown; kind?: unknown };
    if (typeof obj.model !== "string") return null;
    const model = resolveInstalled(obj.model, installed);
    if (!model) return null;
    let kind: TaskKind | null = null;
    if (typeof obj.kind === "string") {
      const k = obj.kind.toLowerCase().trim();
      if ((KINDS as readonly string[]).includes(k)) kind = k as TaskKind;
    }
    return { model, kind };
  } catch {
    return null;
  }
}

/** Parse the router model's reply into a task kind. Tolerant of fences/prose. Pure + tested. */
export function parseRoute(text: string): TaskKind | null {
  if (!text) return null;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try {
      const obj = JSON.parse(text.slice(start, end + 1)) as { kind?: unknown };
      if (typeof obj.kind === "string") {
        const k = obj.kind.toLowerCase().trim();
        if ((KINDS as readonly string[]).includes(k)) return k as TaskKind;
      }
    } catch {
      /* fall through to keyword scan */
    }
  }
  // Last resort: scan for a bare category word in the reply.
  const lower = text.toLowerCase();
  for (const k of KINDS) if (new RegExp(`\\b${k}\\b`).test(lower)) return k;
  return null;
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
 * Build the reason→build step list for a known task kind + installed models.
 * `opts.buildModel` forces a specific build model (by-name routing); otherwise
 * the best installed model for the kind is chosen. Pure.
 */
export function planFor(
  prompt: string,
  kind: TaskKind,
  installed: string[],
  opts?: { allowChain?: boolean; buildModel?: string },
): PlanStep[] {
  const primary = opts?.buildModel ?? pickModel(kind, installed);
  const steps: PlanStep[] = [];
  if (!primary) return steps;
  if (opts?.allowChain && needsReasoning(prompt)) {
    const reasoner = pickModel("reason", installed);
    if (reasoner && reasoner !== primary) steps.push({ role: "reason", model: reasoner });
  }
  steps.push({ role: "build", model: primary });
  return steps;
}

/**
 * Deterministic chain: classify the task offline, then plan reason→build. Used
 * directly when there is no router, and as the fallback when the router fails.
 */
export function planChain(
  prompt: string,
  installed: string[],
  opts?: { allowChain?: boolean },
): { kind: TaskKind; steps: PlanStep[] } {
  const kind = classifyTask(prompt);
  return { kind, steps: planFor(prompt, kind, installed, opts) };
}

export type Dispatch = {
  kind: TaskKind;
  steps: PlanStep[];
  /** The router model that decided, or null if routing was skipped/failed. */
  router: string | null;
  /** True when the live router model made the call; false when the deterministic classifier did. */
  routed: boolean;
  /** True when the router named the build model itself (by-name mode). */
  byName: boolean;
};

/**
 * The full dispatcher. A small fast router model designates the specialist; the
 * orchestrator then maps that to an installed model and plans the chain. `ask`
 * runs one non-streaming completion (wired to the local engine by the caller).
 * Never throws: any router failure falls back to the deterministic classifier,
 * so a build is always planned when a model is installed.
 */
export async function dispatch(
  prompt: string,
  installed: string[],
  ask: (model: string, prompt: string) => Promise<string>,
  opts?: { allowChain?: boolean; routerModel?: string | null; byName?: boolean },
): Promise<Dispatch> {
  const fallback = (): Dispatch => {
    const { kind, steps } = planChain(prompt, installed, opts);
    return { kind, steps, router: null, routed: false, byName: false };
  };
  const router =
    opts?.routerModel && installed.includes(opts.routerModel)
      ? opts.routerModel
      : pickRouter(installed);
  if (!router) return fallback();
  try {
    if (opts?.byName) {
      // By-name mode: the router picks the exact model from the installed list.
      const reply = await ask(router, routerModelPrompt(prompt, installed));
      const route = parseModelRoute(reply, installed);
      if (route) {
        const kind = route.kind ?? classifyTask(prompt);
        const steps = planFor(prompt, kind, installed, { ...opts, buildModel: route.model });
        if (steps.length > 0) return { kind, steps, router, routed: true, byName: true };
      }
      // Named model was invalid/unavailable — fall through to category routing.
    }
    const reply = await ask(router, routerPrompt(prompt));
    const kind = parseRoute(reply);
    if (!kind) return fallback();
    const steps = planFor(prompt, kind, installed, opts);
    if (steps.length === 0) return fallback();
    return { kind, steps, router, routed: true, byName: false };
  } catch {
    return fallback();
  }
}
