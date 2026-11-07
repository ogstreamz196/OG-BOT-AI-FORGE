@echo off
REM ============================================================
REM  start_ollama.bat — portable Ollama server for OG-BOT
REM  Put this on your drive (e.g. E:\OG-BOT\). Double-click to run.
REM  Serves the local API at http://127.0.0.1:11434 and allows
REM  the studio (and any origin) to call it from the browser.
REM ============================================================
setlocal
set DRIVE=%~d0

REM Keep models on this drive (change the path if yours differs):
set OLLAMA_MODELS=%DRIVE%\OG-BOT\ollama\models

REM Allow browser calls from any origin (studio, localhost, file://):
set OLLAMA_ORIGINS=*

REM Point to the portable Ollama you installed on the drive, else PATH:
set OLLAMA_EXE=%DRIVE%\OG-BOT\ollama\app\ollama.exe
if not exist "%OLLAMA_EXE%" set OLLAMA_EXE=ollama

echo Starting Ollama...
echo   Models: %OLLAMA_MODELS%
echo   Origins: %OLLAMA_ORIGINS%
echo   API:     http://127.0.0.1:11434
echo.
"%OLLAMA_EXE%" serve
