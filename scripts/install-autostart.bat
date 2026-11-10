@echo off
REM ============================================================
REM  install-autostart.bat  (run once on each laptop, no admin needed)
REM  Makes OG-BOT start automatically whenever this drive is plugged in:
REM  copies a tiny watcher to your user folder and adds it to Startup.
REM  Undo with uninstall-autostart.bat.
REM ============================================================
setlocal
set DEST=%LOCALAPPDATA%\OG-BOT
set STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
set VBS=%STARTUP%\og-bot-drive-watcher.vbs

if not exist "%~dp0drive-watcher.ps1" (
  echo drive-watcher.ps1 must be in the same folder as this file.
  pause
  exit /b 1
)
if not exist "%DEST%" mkdir "%DEST%"
copy /y "%~dp0drive-watcher.ps1" "%DEST%\drive-watcher.ps1" >nul

REM A .vbs runs PowerShell with no visible window.
> "%VBS%" echo CreateObject("WScript.Shell").Run "powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File ""%DEST%\drive-watcher.ps1""", 0, False

REM Start it now as well (it ignores itself if already running).
wscript.exe "%VBS%"

echo.
echo  OG-BOT autostart installed.
echo  Plug in the drive and OG-BOT starts by itself (about 5 seconds).
echo  The launcher must be at:  ^<drive^>:\OFFLINE AI\OG-BOT\launch-hub.bat
echo.
pause
