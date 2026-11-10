@echo off
REM ============================================================
REM  start_ollama.bat — portable Ollama server for OG-BOT
REM  Put this on your drive in <drive>:\OFFLINE AI\OG-BOT\ (any letter). Double-click to run.
REM  Serves the local API at http://127.0.0.1:11434 and allows
REM  the studio (and any origin) to call it from the browser.
REM ============================================================
setlocal
set DRIVE=%~d0

REM Keep models on this drive (change the path if yours differs):
set OLLAMA_MODELS=%DRIVE%\OG-BOT\ollama\models
if exist "%DRIVE%\OFFLINE AI\ollama\models" set OLLAMA_MODELS=%DRIVE%\OFFLINE AI\ollama\models

REM Local only, and keep models loaded in the RTX 5080 between requests:
set OLLAMA_HOST=127.0.0.1:11434
set OLLAMA_KEEP_ALIVE=24h
where nvidia-smi >nul 2>nul && set "CUDA_VISIBLE_DEVICES=0" && set "HIP_VISIBLE_DEVICES=-1" && set "GGML_VK_VISIBLE_DEVICES=-1"

REM Allow browser calls from any origin (studio, localhost, file://):
set OLLAMA_ORIGINS=*

REM Point to the portable Ollama on the drive (<drive>:\OFFLINE AI\ollama\bin first), else PATH:
set OLLAMA_EXE=%DRIVE%\OFFLINE AI\ollama\bin\ollama.exe
if not exist "%OLLAMA_EXE%" set OLLAMA_EXE=%DRIVE%\OG-BOT\ollama\app\ollama.exe
if not exist "%OLLAMA_EXE%" set OLLAMA_EXE=ollama

echo Starting Ollama...
echo   Models: %OLLAMA_MODELS%
echo   Origins: %OLLAMA_ORIGINS%
echo   API:     http://127.0.0.1:11434
echo.
"%OLLAMA_EXE%" serve
