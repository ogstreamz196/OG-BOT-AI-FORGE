import { describe, expect, it } from "vitest";
import { DRIVE_KIT } from "@/components/studio/SetupGuide";

const file = (n: string) => DRIVE_KIT.find((f) => f.name === n)!.content;

describe("drive kit (plug in and go)", () => {
  it("ships the whole kit", () => {
    expect(DRIVE_KIT.map((f) => f.name).sort()).toEqual([
      "drive-watcher.ps1",
      "install-autostart.bat",
      "launch-hub.bat",
      "og-drive-server.py",
      "og_self_repair.py",
      "start_ollama.bat",
      "uninstall-autostart.bat",
    ]);
  });
  it("watcher looks for the launcher where the instructions say to put it", () => {
    expect(file("drive-watcher.ps1")).toContain("'OFFLINE AI\\OG-BOT\\launch-hub.bat'");
    expect(file("install-autostart.bat")).toContain("drive-watcher.ps1");
  });
  it("launcher uses the portable Ollama, local-only, any origin, and closes itself when auto-started", () => {
    const l = file("launch-hub.bat");
    expect(l).toContain("%ROOT%\\ollama\\bin\\ollama.exe");
    expect(l).toContain("set OLLAMA_HOST=127.0.0.1:11434");
    expect(l).toContain("set OLLAMA_ORIGINS=*");
    expect(l).toContain('if /i "%~1"=="auto" exit /b 0');
    expect(l).toContain("--app=%APP%");
  });
  it("installer needs no admin: it uses the per-user Startup folder", () => {
    expect(file("install-autostart.bat")).toContain(
      "%APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\Startup",
    );
    expect(file("install-autostart.bat")).not.toMatch(/schtasks|runas/i);
  });
});

describe("launcher starts the drive server", () => {
  it("prefers the drive server when Python is on the drive, else starts engines directly", () => {
    const l = DRIVE_KIT.find((f) => f.name === "launch-hub.bat")!.content;
    expect(l).toContain('"%~dp0og-drive-server.py"');
    expect(l).toContain("ComfyUI_windows_portable\\python_embeded\\python.exe");
    expect(l.indexOf(":no_server")).toBeLessThan(l.indexOf("REM --- 1. Ollama"));
    expect(l).toContain(":open_app");
  });
});

describe("drive-letter independence (works on X:, E:, …)", () => {
  it("no drive kit file or generated stitch script hardcodes a drive letter", async () => {
    const { stitchBatch } = await import("@/lib/mv-pipeline");
    const letter = /(?<![%\w])[A-Za-z]:\\(?!Windows\\)/; // %ProgramFiles% / C:\Windows\System32 are fine
    for (const f of DRIVE_KIT) expect(f.content, f.name).not.toMatch(letter);
    expect(stitchBatch([{ scene_id: 1 }, { scene_id: 2 }])).not.toMatch(letter);
    expect(stitchBatch([{ scene_id: 1 }])).toContain('cd /d "%~dp0"');
  });
  it("docked runs keep models loaded 24h and stay on CUDA only", () => {
    const l = DRIVE_KIT.find((f) => f.name === "launch-hub.bat")!.content;
    expect(l).toContain("set OLLAMA_KEEP_ALIVE=24h");
    expect(l).toContain('set "HIP_VISIBLE_DEVICES=-1"');
    expect(l).toContain('set "GGML_VK_VISIBLE_DEVICES=-1"');
    expect(l).toContain("--enable-cors-header *");
  });
});
