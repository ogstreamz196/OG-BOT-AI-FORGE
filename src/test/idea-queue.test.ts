import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ideaQueue, sendQueuedIdeas } from "@/lib/idea-queue";
import { driveLink } from "@/lib/drive-link";

describe("OG BOT task queue (drive offline)", () => {
  beforeEach(() => ideaQueue._reset());
  afterEach(() => vi.restoreAllMocks());

  it("keeps tasks on the device while the drive is offline", async () => {
    vi.spyOn(driveLink, "get").mockReturnValue({ mode: "none", base: null, status: null, message: "Drive offline" });
    ideaQueue.add("  Make the Settings titles bigger  ");
    ideaQueue.add("");
    expect(ideaQueue.get().map((q) => q.text)).toEqual(["Make the Settings titles bigger"]);
    expect(JSON.parse(localStorage.getItem("og-idea-queue-v1")!)).toHaveLength(1);
    expect(await sendQueuedIdeas()).toBe(0);
  });

  it("sends them to the drive when it's back, and keeps what failed", async () => {
    vi.spyOn(driveLink, "get").mockReturnValue({ mode: "none", base: null, status: null, message: "" });
    ideaQueue.add("one");
    ideaQueue.add("two");
    vi.spyOn(driveLink, "get").mockReturnValue({ mode: "remote", base: "https://drive.example", status: null, message: "" });
    const bodies: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      bodies.push(`${String(url)} ${String(init?.body)}`);
      return new Response("{}", { status: bodies.length === 1 ? 200 : 500 });
    });
    expect(await sendQueuedIdeas()).toBe(1);
    expect(bodies[0]).toBe('https://drive.example/og/repair/idea {"text":"one"}');
    expect(ideaQueue.get().map((q) => q.text)).toEqual(["two"]);
  });

  it("can remove a waiting task", () => {
    vi.spyOn(driveLink, "get").mockReturnValue({ mode: "none", base: null, status: null, message: "" });
    ideaQueue.add("oops");
    ideaQueue.remove(ideaQueue.get()[0]!.id);
    expect(ideaQueue.get()).toEqual([]);
  });
});
