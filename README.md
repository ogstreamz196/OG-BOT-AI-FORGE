# OG-BOT · Offline AI App Builder

A fully offline, all-in-one AI **web-app builder** — a Lovable-style studio that
runs on your own hardware. Describe a change in chat and it edits your site; the
preview updates live. Powered by your own local models (nothing is sent to the
cloud), with connectors for the services your sites need.

Live (personal/testing): **https://offline.ogbot.co.uk**
(Separate from the main `ogbot.co.uk` site.)

## What it does

- **AI Builder (chat):** natural-language edits ("add a hero", "set the title to
  …", "change the background to #0a0e17"). Uses your local Ollama model when
  connected; otherwise a deterministic offline edit engine.
- **Live preview + Code + Layout:** see the site, edit the files, or manage
  sections (reorder / duplicate / remove).
- **Section library & templates:** navbar, hero, features, pricing, testimonials,
  FAQ, gallery, team, contact form, CTA, footer; landing / portfolio / contact
  starters. Insert from chat or the visual **+ Section** menu.
- **Theme & Brand:** brand colours + font that cascade across every section (CSS
  variables) and ship in the export.
- **Connectors:** local AI (Ollama / ComfyUI), Supabase, Stripe, REST/Webhooks,
  Email — enable and configure per project.
- **Build & Publish:** export a single-file HTML or a ZIP; trigger real Android
  (APK) / iOS / web builds via GitHub Actions.
- **Settings:** manage local models (download-later catalog), backend status, data.
- **Offline / installable:** a PWA that caches itself and works with no network;
  a drive launcher (`scripts/launch-hub.bat`) starts the local engines.

## Stack

TanStack Start (React 19) + Vite, Tailwind, deployed to **Cloudflare Workers**
(Nitro `cloudflare-module`). Data in **Supabase** (offline-first). All free-tier.

## Develop

```sh
bun install
bun run dev      # local dev server
bun run test     # vitest
bun run build    # Cloudflare Workers bundle in .output/
bun run deploy   # build + wrangler deploy (needs CLOUDFLARE_API_TOKEN)
```

Deploys run automatically via `.github/workflows/deploy.yml` on push.

## Connect your offline hardware

Run the engines on your machine (e.g. `ollama serve`, ComfyUI), then in the app
open **Tools → Connectors → Ollama**, set `http://localhost:11434`, and **Test
connection**. In **Settings**, mark a coding model installed and set it active —
the chat then generates real code with your local model. See
[`scripts/README.md`](scripts/README.md) and [`MIGRATION.md`](MIGRATION.md).
