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

describe("websites and apps go to Build", () => {
  it("routes landing pages, sites and apps to build, even when they mention images or videos", () => {
    expect(
      classifyCreation(
        "Make a landing page for a children's entrepreneur educational course with a realistic sell",
      ),
    ).toBe("build");
    expect(classifyCreation("a website for my barber shop with a photo gallery")).toBe("build");
    expect(classifyCreation("build me a todo app")).toBe("build");
    expect(classifyCreation("a dashboard with a video of the product")).toBe("build");
  });
  it("leaves real media requests alone", () => {
    expect(classifyCreation("a minimalist logo for a coffee brand called OROVA")).toBe("image");
    expect(classifyCreation("a 60-second synthwave music video about a desert road trip")).toBe(
      "video",
    );
    expect(classifyCreation("apple orchard at sunset")).toBe("image");
    expect(classifyCreation("a logo for my app")).toBe("image");
    expect(classifyCreation("an icon for my website")).toBe("image");
  });
  it("the AI router may answer build", () => {
    expect(parseCreation('{"kind":"build","reason":"a website"}')).toBe("build");
  });
});
