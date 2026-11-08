import { describe, expect, it } from "vitest";
import { slashReply } from "@/components/studio/Agent";
import { MODELS } from "@/components/studio/Hardware";

describe("agent slash commands", () => {
  it("scaffold uses given project name", () => {
    expect(slashReply("/scaffold demo")?.at(-1)).toBe("Project demo ready.");
  });
  it("plain text is not a slash command", () => {
    expect(slashReply("add login")).toBeNull();
  });
});

describe("model matrix", () => {
  it("every listed model fits the RTX 5080's 16 GB", () => {
    expect(MODELS.find((m) => m.name.includes("deepseek-r1:14b"))?.vram).toBe(10.5);
    expect(MODELS.every((m) => m.vram <= 16)).toBe(true);
  });
});
