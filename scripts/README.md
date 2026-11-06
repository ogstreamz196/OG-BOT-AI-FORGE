# OG-BOT drive launcher

`launch-hub.bat` boots your local AI engines and opens the OG-BOT builder.
It is zero-cost and offline: all inference runs on your own GPU.

## How the builder reaches your hardware
The builder is a web app. In the browser it calls your local engines directly:
- **Ollama** at `http://localhost:11434` (code/reasoning) — drives the AI chat.
- **ComfyUI** at `http://localhost:8188` (images).

Browsers allow `localhost` calls even from the HTTPS site, so the cloud-hosted
UI can drive local models. You just need to allow the site origin in Ollama —
the launcher sets `OLLAMA_ORIGINS` for you.

## Two ways to run

### A. Installed PWA (recommended)
1. Open `https://offline.ogbot.co.uk` once in Chrome/Edge.
2. Use the browser's **Install app** option. It caches itself and gets its own
   window/icon — it then opens and runs **offline**.
3. Run `launch-hub.bat` to start Ollama/ComfyUI; use the installed app.

### B. Fully from the drive
1. Build the site (`bun run build`) and copy a static copy to
   `<DRIVE>\app-builder\dist` (or use the PWA cache from option A).
2. Uncomment the two `serve` lines at the bottom of `launch-hub.bat`.
3. Run it — the builder is served at `http://localhost:5050`, 100% offline.

## In the app
Open **Tools → Connectors**, enable **Ollama**, set the base URL
(`http://localhost:11434`), and **Test connection**. Then in **Settings** mark a
coding model installed and set it active. The chat now generates real code with
your local model; with no engine it falls back to the built-in offline editor.
