@echo off
REM Removes OG-BOT plug-in autostart from this laptop.
setlocal
del "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\og-bot-drive-watcher.vbs" 2>nul
powershell.exe -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='powershell.exe'\" | Where-Object { $_.CommandLine -like '*drive-watcher.ps1*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }" 2>nul
rmdir /s /q "%LOCALAPPDATA%\OG-BOT" 2>nul
echo OG-BOT autostart removed.
pause
