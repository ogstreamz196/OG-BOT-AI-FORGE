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
