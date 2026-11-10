@echo off
REM ============================================================
REM  OG-BOT Offline AI Hub launcher (portable, zero-cost)
REM  Put this .bat anywhere on your NVMe drive. It starts your
REM  local AI engines, then opens the OG-BOT builder (the PWA).
REM  Nothing here phones home; all AI runs on your GPU.
REM ============================================================
setlocal
set DRIVE=%~d0
echo OG-BOT Hub starting from drive %DRIVE% ...

REM --- 1. Ollama (local code/reasoning models) ---------------
REM Keep models on the drive so they stay portable:
set OLLAMA_MODELS=%DRIVE%\ollama
REM Allow the builder's web origin to call Ollama from the browser:
set OLLAMA_ORIGINS=https://offline.ogbot.co.uk,https://*.lovable.app,http://localhost:5050,app://.
where ollama >nul 2>nul
if %errorlevel%==0 (
  echo Starting Ollama ...
  start "Ollama" cmd /c "ollama serve"
) else (
  echo [skip] Ollama not found on PATH - install it or add it to PATH.
)

REM --- 2. ComfyUI (local image generation) -------------------
if exist "%DRIVE%\runtimes\image-engine\main.py" (
  echo Starting ComfyUI ...
  start "ComfyUI" cmd /c "cd /d %DRIVE%\runtimes\image-engine && python main.py --port 8188"
) else (
  echo [skip] ComfyUI not found at %DRIVE%\runtimes\image-engine
)

REM --- 3. Open the OG-BOT builder ----------------------------
REM Default: open the installed PWA / hosted builder. It is cached
REM for offline use once you have installed it from the browser.
echo Opening OG-BOT builder ...
start "" "https://offline.ogbot.co.uk"

REM --- Optional: serve a local copy from the drive instead ----
REM If you keep a built copy of the site in %DRIVE%\app-builder\dist,
REM uncomment the next two lines to run it fully from the drive:
REM start "OG-BOT site" cmd /c "cd /d %DRIVE%\app-builder\dist && npx --yes serve -l 5050 ."
REM start "" "http://localhost:5050"

echo.
echo OG-BOT Hub is up. Leave this window open; close it to stop the engines.
pause
