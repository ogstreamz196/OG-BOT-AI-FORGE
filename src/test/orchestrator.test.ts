import { describe, expect, it } from "vitest";
import { classifyTask, pickModel, needsReasoning, planChain } from "@/lib/orchestrator";

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
