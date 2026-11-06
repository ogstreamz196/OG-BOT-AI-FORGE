# Migration: Lovable → GitHub + Supabase + Cloudflare

This app now runs independently of Lovable. Source lives in GitHub, data in
Supabase, and it deploys to Cloudflare Workers at **offline.ogbot.co.uk**.

## Lovable credits

Nothing in this repo consumes Lovable credits — those are only spent when
Lovable's own AI agent runs. The build uses the `@lovable.dev/vite-tanstack-config`
npm package (just Vite/Nitro tooling, fetched from the public npm registry; no
Lovable account or credits involved) and two harmless error-reporting hooks that
are no-ops outside the Lovable editor. To stop commits syncing to Lovable
entirely, disconnect the GitHub integration in the Lovable project settings.

## What is already done (by automation)

- **Cloudflare zone** `ogbot.co.uk` created (status: _pending nameserver change_).
- **Supabase** project `OG-BOT OFFLINE AI` (`hukxeaewihywbkstkgyf`, eu-west-1)
  restored, with `licenses` + `usage_ledger` tables, RLS, triggers and seed rows.
  Schema is version-controlled in `supabase/migrations/`.
- **App wired to Supabase** (offline-first): the Developer Dashboard, licensing
  and usage ledger hydrate from and write through to Supabase, falling back to
  `localStorage` when offline. Config in `.env` (publishable key — public).
- **Deploy pipeline**: GitHub Actions workflow `.github/workflows/deploy.yml`
  builds and deploys to Cloudflare Workers on push.

## Manual steps you need to do

### 1. Point the domain at Cloudflare
At your registrar (the domain is currently on GoDaddy — `ns03/ns04.domaincontrol.com`),
replace the nameservers with:

```
albert.ns.cloudflare.com
shaz.ns.cloudflare.com
```

Propagation is usually 15 min–24 h. The zone flips from `pending` to `active`
once Cloudflare sees the change.

### 2. Create a Cloudflare API token
Cloudflare dashboard → My Profile → API Tokens → Create Token →
**"Edit Cloudflare Workers"** template, scoped to this account. Copy the token.

Account ID: `e7548b9cfc59c9791ad6bfbbc676961c`

### 3. Add GitHub Actions secrets
Repo → Settings → Secrets and variables → Actions → New repository secret:

| Secret                  | Value                                      |
| ----------------------- | ------------------------------------------ |
| `CLOUDFLARE_API_TOKEN`  | the token from step 2                      |
| `CLOUDFLARE_ACCOUNT_ID` | `e7548b9cfc59c9791ad6bfbbc676961c`         |

The next push (or a manual "Run workflow") then builds and deploys the Worker.

### 4. Attach the custom domain
Once the zone is **active** and the Worker has deployed once, add the custom
domain in Cloudflare → Workers & Pages → the worker → Settings → Domains &
Routes → Add → `offline.ogbot.co.uk`. (Or ask me to do it via the Cloudflare
API once the zone is active.)

## Security follow-up

The `licenses` / `usage_ledger` RLS policies currently allow the anonymous
(publishable) key full read/write, because there is no end-user auth yet. Before
onboarding real paying customers, add Supabase Auth and restrict these policies
to the owner — otherwise anyone with the public key could change tier/licensing
rows. See the comment in `supabase/migrations/20261106020000_offline_studio_schema.sql`.

## Local commands

```bash
bun install
bun run dev          # local dev
bun run test         # vitest
bun run build        # Cloudflare Workers bundle in .output/
bun run deploy       # build + wrangler deploy (needs CLOUDFLARE_API_TOKEN env)
```
