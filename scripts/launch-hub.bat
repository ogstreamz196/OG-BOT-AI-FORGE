@echo off
REM ============================================================
REM  OG-BOT Offline AI Hub launcher (portable, zero-cost)
REM  Keep this at  <drive>:\OFFLINE AI\OG-BOT\launch-hub.bat
REM  Starts Ollama + ComfyUI from the drive, then opens the
REM  OG-BOT studio in its own window (works offline once the
REM  app is installed in Chrome/Edge). Started automatically by
REM  the drive watcher, or double-click it yourself.
REM ============================================================
setlocal
set DRIVE=%~d0
set ROOT=%DRIVE%\OFFLINE AI
set APP=https://offline.ogbot.co.uk
echo OG-BOT Hub starting from %ROOT% ...

REM --- 0. Drive server (hardware scan, engines, remote access) ---
REM Uses Python from the drive: OFFLINE AI\python or ComfyUI portable's python_embeded.
set PY=
if exist "%ROOT%\python\python.exe" set "PY=%ROOT%\python\python.exe"
if not defined PY if exist "%ROOT%\ComfyUI_windows_portable\python_embeded\python.exe" set "PY=%ROOT%\ComfyUI_windows_portable\python_embeded\python.exe"
if not defined PY (python -c "import sys" >nul 2>nul && set PY=python)
if not defined PY goto no_server
if not exist "%~dp0og-drive-server.py" goto no_server
curl.exe -s -o nul http://127.0.0.1:11500/og/status >nul 2>nul
if %errorlevel%==0 (
  echo Drive server already running.
) else (
  echo Starting the OG-BOT drive server: scanning hardware, starting engines ...
  start "OG-BOT drive server" /min "%PY%" "%~dp0og-drive-server.py"
)
goto open_app
:no_server
echo [info] No Python on the drive: starting the engines directly (no remote access).

REM --- 1. Ollama ----------------------------------------------
set OLLAMA_HOST=127.0.0.1:11434
set OLLAMA_ORIGINS=*
set OLLAMA_KEEP_ALIVE=30m
if exist "%ROOT%\ollama\models" set OLLAMA_MODELS=%ROOT%\ollama\models
set OLLAMA_EXE=%ROOT%\ollama\bin\ollama.exe
if not exist "%OLLAMA_EXE%" set OLLAMA_EXE=ollama

curl.exe -s -o nul http://127.0.0.1:11434 >nul 2>nul
if %errorlevel%==0 (
  echo Ollama is already running.
) else (
  echo Starting Ollama ...
  start "Ollama" /min "%OLLAMA_EXE%" serve
)

REM --- 2. ComfyUI ---------------------------------------------
curl.exe -s -o nul http://127.0.0.1:8188 >nul 2>nul
if %errorlevel%==0 goto comfy_done
REM --enable-cors-header lets the studio (a web page) talk to ComfyUI.
set COMFY_ARGS=--listen 127.0.0.1 --port 8188 --enable-cors-header
if exist "%ROOT%\ComfyUI_windows_portable\python_embeded\python.exe" (
  echo Starting ComfyUI portable ...
  start "ComfyUI" /min /d "%ROOT%\ComfyUI_windows_portable" "%ROOT%\ComfyUI_windows_portable\python_embeded\python.exe" -s ComfyUI\main.py --windows-standalone-build %COMFY_ARGS%
  goto comfy_done
)
if exist "%ROOT%\ComfyUI\main.py" (
  echo Starting ComfyUI ...
  start "ComfyUI" /min /d "%ROOT%\ComfyUI" python main.py %COMFY_ARGS%
  goto comfy_done
)
echo [skip] ComfyUI not found in %ROOT%
:comfy_done

:open_app
REM --- 3. Open the studio in an app window ----------------------
set CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe
set EDGE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe
if exist "%CHROME%" goto open_chrome
if exist "%EDGE%" goto open_edge
start "" "%APP%"
goto opened
:open_chrome
start "" "%CHROME%" --app=%APP%
goto opened
:open_edge
start "" "%EDGE%" --app=%APP%
:opened

echo.
echo OG-BOT Hub is up. Ollama and ComfyUI keep running in their own windows.
if /i "%~1"=="auto" exit /b 0
pause
