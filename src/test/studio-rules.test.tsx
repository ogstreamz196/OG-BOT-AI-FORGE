import { beforeEach, describe, expect, it } from "vitest";
import { slashReply } from "@/components/studio/Agent";
import { MODELS } from "@/components/studio/Hardware";
import { workspace } from "@/lib/workspace";

beforeEach(() => workspace._reset());

describe("agent slash commands", () => {
  it("scaffold uses given project name", () => {
    expect(slashReply("/scaffold demo")?.at(-1)).toBe("Project demo ready.");
  });
  it("plain text is not a slash command", () => {
    expect(slashReply("add login")).toBeNull();
  });
});

describe("model matrix", () => {
  it("is the real roster, nothing over 14B", () => {
    expect(MODELS.some((m) => m.tag === "qwen2.5-coder:14b")).toBe(true);
    expect(MODELS.every((m) => !/:(1[5-9]|[2-9]\d)b/i.test(m.tag))).toBe(true);
  });
});
