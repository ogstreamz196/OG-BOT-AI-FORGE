import { describe, expect, it } from "vitest";
import {
  classifyTask,
  pickModel,
  pickRouter,
  parseRoute,
  parseModelRoute,
  dispatch,
  needsReasoning,
  planChain,
} from "@/lib/orchestrator";

const INSTALLED = [
  "llama3.2:1b",
  "llama3.2:3b",
  "llama3.1:8b",
  "qwen2.5:14b",
  "qwen2.5-coder:7b",
  "qwen2.5-coder:32b",
  "deepseek-r1:8b",
  "deepseek-r1:32b",
  "gemma4:12b",
  "llama3.3:70b",
  "nomic-embed-text",
];

describe("classifyTask", () => {
  it("routes by intent", () => {
    expect(classifyTask("write a python function to sort a list")).toBe("code");
    expect(classifyTask("explain step by step why the sky is blue")).toBe("reason");
    expect(classifyTask("describe this image")).toBe("vision");
    expect(classifyTask("use your most capable flagship model")).toBe("flagship");
    expect(classifyTask("hey how are you")).toBe("chat");
  });
});

describe("pickModel", () => {
  it("picks the best installed model per task", () => {
    expect(pickModel("code", INSTALLED)).toBe("qwen2.5-coder:32b");
    expect(pickModel("reason", INSTALLED)).toBe("deepseek-r1:32b");
    expect(pickModel("vision", INSTALLED)).toBe("gemma4:12b");
    expect(pickModel("flagship", INSTALLED)).toBe("llama3.3:70b");
    expect(pickModel("chat", INSTALLED)).toBe("llama3.2:3b");
  });
  it("never picks an embeddings model as fallback", () => {
    expect(pickModel("vision", ["nomic-embed-text", "llama3.2:1b"])).toBe("llama3.2:1b");
  });
  it("returns null with no models", () => {
    expect(pickModel("code", [])).toBeNull();
  });
});

describe("planChain", () => {
  it("chains reason -> build for hard coding tasks when allowed", () => {
    const hard =
      "Refactor the whole app: add auth, a dashboard, and a settings page, then wire them together and explain the plan";
    const { steps } = planChain(hard, INSTALLED, { allowChain: true });
    expect(steps.map((s) => s.role)).toEqual(["reason", "build"]);
    expect(steps.find((s) => s.role === "build")!.model).toMatch(/coder/);
  });
  it("single step for simple tasks", () => {
    const { steps } = planChain("add a hero", INSTALLED, { allowChain: true });
    expect(steps.map((s) => s.role)).toEqual(["build"]);
  });
  it("no chain when not allowed", () => {
    const hard =
      "Refactor the whole app and explain the plan step by step in detail with many parts, then build it";
    const { steps } = planChain(hard, INSTALLED, { allowChain: false });
    expect(steps.map((s) => s.role)).toEqual(["build"]);
  });
});

describe("needsReasoning", () => {
  it("flags complex, not trivial", () => {
    expect(needsReasoning("add a footer")).toBe(false);
    expect(needsReasoning("use your flagship model")).toBe(true);
  });
});

describe("pickRouter", () => {
  it("prefers a small fast model as the dispatcher", () => {
    expect(pickRouter(INSTALLED)).toBe("llama3.2:3b");
  });
  it("never routes with an embeddings model", () => {
    expect(pickRouter(["nomic-embed-text", "qwen2.5:14b"])).toBe("qwen2.5:14b");
    expect(pickRouter([])).toBeNull();
  });
});

describe("parseRoute", () => {
  it("parses a clean JSON reply", () => {
    expect(parseRoute('{"kind":"code","reason":"edit a web page"}')).toBe("code");
  });
  it("tolerates fences and prose", () => {
    expect(parseRoute('Sure!\n```json\n{"kind":"reason"}\n```')).toBe("reason");
  });
  it("falls back to a bare category word", () => {
    expect(parseRoute("I think this is a vision task")).toBe("vision");
  });
  it("returns null for junk", () => {
    expect(parseRoute("banana")).toBeNull();
    expect(parseRoute("")).toBeNull();
  });
});

describe("dispatch", () => {
  it("routes via the router model and builds with the specialist", async () => {
    const calls: string[] = [];
    const ask = async (model: string) => {
      calls.push(model);
      return '{"kind":"code"}';
    };
    const plan = await dispatch("make me a thing", INSTALLED, ask);
    expect(plan.routed).toBe(true);
    expect(plan.router).toBe("llama3.2:3b");
    expect(plan.kind).toBe("code");
    expect(plan.steps.find((s) => s.role === "build")!.model).toMatch(/coder/);
    expect(calls).toEqual(["llama3.2:3b"]);
  });

  it("falls back to the deterministic classifier when the router throws", async () => {
    const ask = async () => {
      throw new Error("engine down");
    };
    const plan = await dispatch("write a python function", INSTALLED, ask);
    expect(plan.routed).toBe(false);
    expect(plan.router).toBeNull();
    expect(plan.kind).toBe("code");
    expect(plan.steps.length).toBeGreaterThan(0);
  });

  it("falls back when the router replies with junk", async () => {
    const plan = await dispatch("add a hero", INSTALLED, async () => "no idea");
    expect(plan.routed).toBe(false);
    expect(plan.steps.map((s) => s.role)).toEqual(["build"]);
  });

  it("honours an explicit router model when installed", async () => {
    const seen: string[] = [];
    const ask = async (model: string) => {
      seen.push(model);
      return '{"kind":"chat"}';
    };
    const plan = await dispatch("hi", INSTALLED, ask, { routerModel: "llama3.1:8b" });
    expect(plan.router).toBe("llama3.1:8b");
    expect(seen).toEqual(["llama3.1:8b"]);
  });
});

describe("parseModelRoute", () => {
  it("accepts a model that is installed", () => {
    const r = parseModelRoute('{"model":"deepseek-r1:8b","kind":"reason"}', INSTALLED);
    expect(r).toEqual({ model: "deepseek-r1:8b", kind: "reason" });
  });
  it("resolves a close-but-partial name to an installed tag", () => {
    const r = parseModelRoute('{"model":"qwen2.5-coder"}', INSTALLED);
    expect(r?.model).toMatch(/^qwen2\.5-coder/);
    expect(r?.kind).toBeNull();
  });
  it("rejects a hallucinated model not installed", () => {
    expect(parseModelRoute('{"model":"gpt-4o"}', INSTALLED)).toBeNull();
  });
  it("rejects junk", () => {
    expect(parseModelRoute("nope", INSTALLED)).toBeNull();
  });
});

describe("dispatch by-name mode", () => {
  it("builds with the exact model the router names", async () => {
    const plan = await dispatch(
      "do a thing",
      INSTALLED,
      async () => '{"model":"deepseek-r1:32b","kind":"reason"}',
      { byName: true },
    );
    expect(plan.routed).toBe(true);
    expect(plan.byName).toBe(true);
    expect(plan.steps.find((s) => s.role === "build")!.model).toBe("deepseek-r1:32b");
  });

  it("falls back to category routing when the named model is invalid", async () => {
    let call = 0;
    const ask = async () => {
      call += 1;
      // First (by-name) reply names a bad model; second (category) reply is valid.
      return call === 1 ? '{"model":"gpt-4o"}' : '{"kind":"code"}';
    };
    const plan = await dispatch("write code", INSTALLED, ask, { byName: true });
    expect(plan.routed).toBe(true);
    expect(plan.byName).toBe(false);
    expect(plan.steps.find((s) => s.role === "build")!.model).toMatch(/coder/);
    expect(call).toBe(2);
  });
});
