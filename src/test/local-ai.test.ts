import { describe, expect, it } from "vitest";
import { parseModelEdit } from "@/lib/local-ai";

describe("parseModelEdit", () => {
  it("parses a plain JSON edit", () => {
    const r = parseModelEdit('{"files":{"index.html":"<h1>Hi</h1>"},"message":"done"}');
    expect(r?.files["index.html"]).toBe("<h1>Hi</h1>");
    expect(r?.message).toBe("done");
  });
  it("parses JSON wrapped in ```json fences with prose", () => {
    const text = 'Sure!\n```json\n{"files":{"app.js":"console.log(1)"}}\n```\nHope that helps.';
    const r = parseModelEdit(text);
    expect(r?.files["app.js"]).toBe("console.log(1)");
    expect(r?.message).toBe("Applied changes.");
  });
  it("ignores non-string file values and rejects empty", () => {
    expect(parseModelEdit('{"files":{"a":123}}')).toBeNull();
    expect(parseModelEdit("no json here")).toBeNull();
    expect(parseModelEdit('{"message":"hi"}')).toBeNull();
  });
});
