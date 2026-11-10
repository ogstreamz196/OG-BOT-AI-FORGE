import { describe, expect, it } from "vitest";
import {
  DEFAULT_CODER,
  DEV_MODES,
  parseFiles,
  previewDoc,
  previewable,
  restoreBatch,
  splitThink,
} from "@/lib/dev-workbench";

describe("dev workbench", () => {
  it("qwen2.5-coder:14b is the default coder; modes bind the right models", () => {
    expect(DEFAULT_CODER).toBe("qwen2.5-coder:14b");
    expect(DEV_MODES.fullstack.model).toBe("qwen2.5-coder:14b");
    expect(DEV_MODES.refactor.model).toBe("deepseek-r1:14b");
    expect(DEV_MODES.automation.model).toBe("dolphin3:8b");
  });

  it("splits DeepSeek thinking, including mid-stream", () => {
    expect(splitThink("<think>step 1")).toEqual({ think: "step 1", answer: "", thinking: true });
    expect(splitThink("<think>plan</think>\nFixed.")).toEqual({
      think: "plan",
      answer: "Fixed.",
      thinking: false,
    });
    expect(splitThink("no thoughts").answer).toBe("no thoughts");
  });

  it("streams files into named tabs from headings and fence info", () => {
    const text =
      "Here:\n### `src/App.tsx`\n```tsx\nexport default 1\n```\nFile: schema.sql\n```sql\ncreate table t();\n```\n```ts api_proxy.ts\nconst x = 1";
    const f = parseFiles(text);
    expect(f.map((x) => x.name)).toEqual(["src/App.tsx", "schema.sql", "api_proxy.ts"]);
    expect(f[0]).toMatchObject({ lang: "tsx", content: "export default 1", complete: true });
    expect(f[2]).toMatchObject({ complete: false, content: "const x = 1" });
  });

  it("names anonymous snippets by language", () => {
    expect(parseFiles("```python\nprint(1)\n```")[0]!.name).toBe("snippet-1.py");
  });

  it("builds a live preview from html/css/js files", () => {
    const files = [
      { name: "index.html", content: "<h1>Hi</h1>" },
      { name: "styles.css", content: "h1{color:red}" },
      { name: "app.js", content: "console.log(1)" },
    ];
    expect(previewable(files)).toBe(true);
    const doc = previewDoc(files);
    expect(doc).toContain("<style>h1{color:red}</style>");
    expect(doc).toContain("<script>console.log(1)</script>");
    expect(previewable([{ name: "schema.sql" }])).toBe(false);
  });

  it("batch script recreates files exactly (base64 + certutil) and asks before running", () => {
    const bat = restoreBatch([{ name: "tools/run.ps1", content: "Write-Host 'é'" }]);
    expect(bat).toContain('if not exist "tools" mkdir "tools"');
    const b64 = [...bat.matchAll(/ogbot\.b64" echo ([A-Za-z0-9+/=]+)\r?$/gm)]
      .map((m) => m[1])
      .join("");
    expect(new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)))).toBe(
      "Write-Host 'é'",
    );
    expect(bat).toContain('certutil -f -decode "%TEMP%\\ogbot.b64" "tools\\run.ps1"');
    expect(bat).toContain("/d N"); // defaults to not running
    expect(bat).toContain('powershell -NoProfile -ExecutionPolicy Bypass -File "tools\\run.ps1"');
  });

  it("sanitises unsafe file names", () => {
    expect(restoreBatch([{ name: "../../evil?.txt", content: "x" }])).not.toContain("..\\");
  });
});
