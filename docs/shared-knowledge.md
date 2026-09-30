# Shared team learning (Cloudflare Worker + KV)

GitHub Pages hosts the SPA. Cloudflare Worker holds secrets and stores shared knowledge in KV.
**Passwords / signing keys never go into the SPA bundle or git.**

## Security model

| Location | Contents |
|----------|----------|
| Cloudflare Worker **Secrets** | `APP_USERNAME`, `APP_PASSWORD`, `SESSION_SIGNING_KEY` |
| Cloudflare **KV** | knowledge + feedback JSON |
| GitHub Pages JS | only public `VITE_KB_API_URL` |
| GitHub repo | Worker source code (no secrets) |

Optional later: put deploy tokens in **GitHub Actions Secrets** and deploy Worker via Wrangler CI — still never bake app passwords into Pages.

## Deploy / update Worker code (dashboard)

1. Open Worker `aintegration-kb-api` → **Edit code**.
2. Replace all code with [`workers/kb-api/src/index.js`](../workers/kb-api/src/index.js).
3. **Deploy**.
4. Confirm bindings: KV variable name **`KB`**, secrets set as before.

Or via CLI (after filling KV id in `wrangler.toml`):

```bash
cd workers/kb-api
npx wrangler deploy
npx wrangler secret put APP_USERNAME
npx wrangler secret put APP_PASSWORD
npx wrangler secret put SESSION_SIGNING_KEY
```

## Frontend env

`.env.local` (gitignored):

```env
VITE_KB_API_URL=https://aintegration-kb-api.cihanhartamaci.workers.dev
```

Then `npm run deploy` for GitHub Pages.

## Product loop

- Login → Worker issues session token (HMAC)
- Thumbs up/down + corrections → KV
- Knowledge desk approve/reject → shared for whole team
- Approved entries → prompt + BM25 (`[LK-…]`)
