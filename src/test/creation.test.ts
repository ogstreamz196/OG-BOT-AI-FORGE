import { describe, expect, it } from "vitest";
import { classifyCreation, parseCreation } from "@/lib/creation";

describe("classifyCreation", () => {
  it("routes by intent", () => {
    expect(classifyCreation("a neon samurai in the rain, cinematic")).toBe("image");
    expect(classifyCreation("a lofi beat for late-night coding")).toBe("song");
    expect(classifyCreation("write a song about summer")).toBe("song");
    expect(classifyCreation("a 60-second synthwave music video")).toBe("video");
    expect(classifyCreation("animate a spaceship launch")).toBe("video");
    expect(classifyCreation("a logo for a coffee brand")).toBe("image");
  });
  it("defaults vague prompts to image", () => {
    expect(classifyCreation("a dragon")).toBe("image");
  });
  it("video wins over song when both appear", () => {
    expect(classifyCreation("a music video with a catchy song")).toBe("video");
  });
});

describe("parseCreation", () => {
  it("parses clean JSON", () => {
    expect(parseCreation('{"kind":"song","reason":"wants a beat"}')).toBe("song");
  });
  it("tolerates prose", () => {
    expect(parseCreation("I'd make a video for this")).toBe("video");
  });
  it("returns null for junk", () => {
    expect(parseCreation("banana")).toBeNull();
  });
});
