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
  it("DeepSeek R1 32B needs 14 GB VRAM", () => {
    expect(MODELS.find((m) => m.name.startsWith("DeepSeek"))?.vram).toBe(14);
  });
});
