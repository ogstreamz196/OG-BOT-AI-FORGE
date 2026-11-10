import { describe, expect, it } from "vitest";
import { DRIVE_KIT } from "@/components/studio/SetupGuide";

const file = (n: string) => DRIVE_KIT.find((f) => f.name === n)!.content;

describe("drive kit (plug in and go)", () => {
  it("ships all five scripts", () => {
    expect(DRIVE_KIT.map((f) => f.name).sort()).toEqual([
      "drive-watcher.ps1",
      "install-autostart.bat",
      "launch-hub.bat",
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
