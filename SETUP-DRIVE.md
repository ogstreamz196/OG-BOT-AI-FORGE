# OG-BOT — Portable Drive Setup (E:)

Everything runs offline from your external drive + GPU. Zero ongoing cost.

## Folder layout (on E:)
```
E:\OFFLINE AI\ollama        <- models + Ollama (OLLAMA_MODELS points here)
E:\OG-BOT\installers        <- keep downloaded installers here
E:\OG-BOT\runtimes\image-engine   <- ComfyUI (optional)
E:\OG-BOT\projects          <- exported sites
```

## 1. Local AI (done — verified)
- Ollama serving at `http://127.0.0.1:11434` with `OLLAMA_ORIGINS=*`.
- Start it anytime with `scripts/start_ollama.bat`.

## 2. Connect the studio
1. Open https://offline.ogbot.co.uk (Chrome/Edge).
2. Tools → Connectors → Ollama → base URL `http://127.0.0.1:11434` → Test.
3. Settings → mark a coding model installed → set active.
4. Chat now builds with your local models.

## 3. Use with no WiFi
- Install the app once online (browser menu → Install app). It caches itself
  and opens offline; AI runs via localhost.
- `scripts/launch-hub.bat` starts the engines and opens the studio.

## 4. DEV mode (DEV.B055)
- Tap the OG BOT logo 5× (or Ctrl/Cmd+Shift+D).
- Google sign-in (allow-listed emails) or the local code `dev.b055`.
- Use "Customer view" to preview what customers see.

## 5. Optional engines
- Images: ComfyUI portable → `http://127.0.0.1:8188` → Connectors → ComfyUI.
- Music video: Tools → Music Video Studio (works staged without ComfyUI).

See README.md for the full feature list and dev commands.
