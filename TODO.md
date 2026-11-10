# OGSTREAMZ presentz OFFLINE FORGE · to-do list

_Powered by OG BOT._ Live at **https://offline.ogbot.co.uk**. Everything runs from the drive
(`E:\OFFLINE AI\`); the website is only the front end. Last updated 2026-11-10.

Legend: **[you]** = needs you (hardware, accounts, settings) · **[dev]** = code work Claude can do ·
P1 = next, P2 = soon, P3 = polish.

---

## 1. Set up once (you)

- [ ] **[you] Hide Lovable's badge** — Lovable editor → project → Settings → *Hide 'Lovable' badge*
      (it covers the Preview tab on phones).
- [ ] **[you] Put the drive kit on the drive** — Setup Guide → *Drive kit* → *Download all*, into
      `E:\OFFLINE AI\OG-BOT\` (keep that folder name: the watcher looks for it).
- [ ] **[you] Python on the drive** for the drive server: ComfyUI portable's `python_embeded`, or the
      Windows "embeddable" Python unzipped to `E:\OFFLINE AI\python\`.
- [ ] **[you] Turn on plug-in autostart** — double-click `install-autostart.bat` once per laptop.
- [ ] **[you] Pair the drive for remote access** — sign in with Google (D.EV) → Setup Guide →
      *Pair this drive* → put `og-drive.json` next to `og-drive-server.py` → replug.
- [ ] **[you] Supabase AI FORGE OFFLINE → Authentication → URL Configuration** — press *Save* on
      Site URL `https://offline.ogbot.co.uk` (redirect URLs are already added).
- [ ] **[you] Pull any roster models you don't have yet** (all ≤14B):
      `phi4:14b`, `gemma4:12b`, `mistral-nemo:12b`, `qwen2.5:7b`, `deepseek-r1:8b`, `hermes3:8b`.
- [ ] **[you] For music videos:** ComfyUI portable in `E:\OFFLINE AI\ComfyUI_windows_portable\`
      with an LTX-Video or Wan 2.1 checkpoint; `ffmpeg.exe` on the drive (set its path in Stage D).
- [ ] **[you] Suno:** pick an API provider, then enter its endpoint + key in Music Video Studio → A.
- [ ] **[you] Optional cleanup:** delete the old Cloudflare Worker `ogstreamz196-og-bot-ai-forge`
      (no longer serves the domain).

## 2. First real-hardware test (you run it, report back; Claude fixes)

These are built and unit-tested but have never run on Windows / the real RTX 5080.

- [ ] Plug in the drive → within ~5 s Ollama, ComfyUI and the studio window open by themselves.
- [ ] `E:\OFFLINE AI\OG-BOT\logs\` and the Hardware tab show **RTX 5080 → Docked Ultra**;
      unplug the eGPU and restart → **Portable**, no ComfyUI.
- [ ] `ollama ps` shows **100% GPU** docked and the model badge shows `14.8B · 16k ctx`.
- [ ] Phone on mobile data → open the site, sign in (D.EV) → Dashboard says
      *Connected to your drive remotely* → a chat reply streams from the laptop.
- [ ] Dev Workbench: generate a small app → tabs fill live → *Generate Batch Script* writes the files.
- [ ] Music Video Studio end to end: lyrics → storyboard → *Send to ComfyUI Queue* → scenes tick
      themselves off → `stitch_video.bat` → `final_master_music_video.mp4`.
- [ ] Airplane mode on the laptop → the installed app still opens and talks to the drive.

## 3. Build next — P1 (dev)

- [ ] **Auto-stitch:** drive server notices all scenes rendered and runs the FFmpeg stitch itself.
- [ ] **Suno → drive:** drive server downloads the finished track as `suno_track.mp3` into the
      clips folder, so Stage D needs no manual step.
- [ ] **Save straight to the drive:** Dev Workbench / Build write files via the drive server
      (sandboxed to `E:\OFFLINE AI\projects\`) instead of a batch script.
- [ ] **Real live hardware stats:** GPU %, VRAM used, temperature from `nvidia-smi` via the drive
      server, replacing the simulated gauges in the Hardware tab.
- [ ] **Apply tier settings even if Ollama was already running** (tray app): offer to restart it
      with the Docked/Portable settings.
- [ ] **Health alerts:** Dashboard warning (and optional phone push) when Ollama/ComfyUI stops
      answering or the drive goes offline.
- [ ] **Stable remote address:** a named Cloudflare tunnel on an `ogbot.co.uk` subdomain instead of
      the changing `*.trycloudflare.com` quick tunnel.

## 4. Build soon — P2 (dev)

- [ ] Create studio / Image Studio route ComfyUI through the drive (works remotely too).
- [ ] Make the AI Builder quick commands real: `/scaffold`, `/export-apk` (GitHub build),
      `/git-commit` / `/git-push` (some are still demos).
- [ ] USB Sentinel bound to the drive itself (volume serial) instead of demo values.
- [ ] Model refresh controls: last update time, *Refresh now*, per-model sizes on the drive.
- [ ] Offline semantic search with `nomic-embed-text` across projects, snippets and lyrics.
- [ ] Stage C quality check: `llama3.2-vision:11b` compares each rendered keyframe with its scene.
- [ ] Usage counters fed by the drive server (every device counts, not just the browser).

## 5. Polish — P3 (dev)

- [ ] Run Prettier over the repo (213 formatting-only lint errors) and fix the 2 real ones
      (`no-useless-escape` in Workbench).
- [ ] Split CodeMirror into its own chunk (bundle size warning) while keeping it cached offline.
- [ ] Fix nested close buttons inside Dev Workbench file tabs (accessibility).
- [ ] Windows CI job: run `test_og_drive_server.py` and PSScriptAnalyzer on the drive scripts.
- [ ] Rewrite `README.md` for OFFLINE FORGE (still describes the earlier build).
- [ ] PWA / favicon / social preview image from the OGSTREAMZ artwork.
- [ ] Remove dead demo code left from the earlier build once each tab is real.

## 6. Across your other projects

- [ ] Add the **"Powered by OG BOT"** badge to OG VAULT, OG BOT, OG LEDGER and future sites
      (each is its own repo/Lovable project: start a session on that repo and ask).

## 7. Known limits

- The offline copy lives in each browser: open the site once online on a new device.
- Quick-tunnel addresses change on every start (the drive re-registers automatically).
- Unrestricted Automation mode is for your own machines only.
- Lovable can take a minute to sync a push before it can publish.

---

## Done

- [x] Drive server: hardware scan (RTX 5080 → Docked, else Portable), tier-tuned Ollama, ComfyUI only
      docked, local API on `127.0.0.1:11500`, Cloudflare tunnel + D.EV-only remote access, 14B ceiling,
      weekly roster model refresh.
- [x] Plug-in autostart (Startup watcher, no admin), drive launcher, drive kit downloads.
- [x] Works offline after one visit (service worker precache, verified with the cache cleared).
- [x] D.EV Google sign-in (AI FORGE OFFLINE) + offline code; database rows D.EV-only.
- [x] Dev Workbench (qwen2.5-coder:14b default, deepseek-r1:14b, dolphin3:8b), live preview,
      batch script export.
- [x] Chat | Split | Preview window picker for Build and Dev, on any screen size.
- [x] Navbar engine badge (online state, model, parameters, context).
- [x] Music Video Studio: 4 stages, tiers, Suno provider + status, ComfyUI auto-tick, FFmpeg script.
- [x] Earlier build restored (Dashboard, Ollama Test, Create, Connectors, Settings, …).
- [x] Rebrand: OGSTREAMZ presentz OFFLINE FORGE; OG BOT is the assistant; every site is
      "Powered by OG BOT".
- [x] Auto test → push → publish on every change; no Lovable credits used.
